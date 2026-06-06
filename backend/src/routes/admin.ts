import { FastifyInstance } from 'fastify';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { config } from '../config.js';
import { runInstagramAutoSync } from '../services/jobs/instagramAutoSync.js';
import { uploadToR2 } from '../services/storage.js';
import { publishToTikTokInbox } from '../services/publishers/tiktok.js';
import { db } from '../db/index.js';
import { posts, media, postPlatforms, platformAccounts, publishLogs } from '../db/schema.js';
import { inArray, eq, desc } from 'drizzle-orm';

export async function adminRoutes(app: FastifyInstance) {
  // Manual trigger for the IG → YT+TikTok sync. Same logic as the 3am cron.
  // Protected by ADMIN_SECRET env var to avoid exposing on a public URL.
  // Read-only snapshot of feature flags so polling jobs can detect when
  // an env var has been toggled in Render and the new build is live.
  app.get('/api/admin/config-snapshot', async (request, reply) => {
    const secret = process.env.ADMIN_SECRET || '';
    if (!secret) return reply.status(503).send({ error: 'ADMIN_SECRET not configured' });
    const provided = (request.headers['x-admin-secret'] || '') as string;
    if (provided !== secret) return reply.status(401).send({ error: 'Unauthorized' });
    return {
      tiktokInboxMode: config.tiktok.inboxMode,
      igAutosyncEnabled: config.instagramAutoSync.enabled,
      igUsername: config.instagramAutoSync.username,
    };
  });

  app.post('/api/admin/run-ig-sync', async (request, reply) => {
    const secret = process.env.ADMIN_SECRET || '';
    if (!secret) return reply.status(503).send({ error: 'ADMIN_SECRET not configured' });

    const provided = (request.headers['x-admin-secret'] || '') as string;
    if (provided !== secret) return reply.status(401).send({ error: 'Unauthorized' });

    try {
      await runInstagramAutoSync();
      return { ok: true };
    } catch (err: any) {
      app.log.error({ err: err.message }, 'manual ig-sync failed');
      return reply.status(500).send({ ok: false, error: err.message });
    }
  });

  // One-shot smoke test: takes a video URL + caption, downloads it to R2,
  // schedules a post for YT+TikTok of the first user who has both connected,
  // and lets the 1-minute publish cron pick it up. Returns the post id.
  app.post('/api/admin/schedule-test-post', async (request, reply) => {
    const secret = process.env.ADMIN_SECRET || '';
    if (!secret) return reply.status(503).send({ error: 'ADMIN_SECRET not configured' });
    const provided = (request.headers['x-admin-secret'] || '') as string;
    if (provided !== secret) return reply.status(401).send({ error: 'Unauthorized' });

    const body = (request.body || {}) as {
      videoUrl?: string;
      caption?: string;
      scheduleInSeconds?: number;
    };
    if (!body.videoUrl) return reply.status(400).send({ error: 'videoUrl required' });

    try {
      const accounts = await db.select().from(platformAccounts).where(
        inArray(platformAccounts.platform, ['youtube', 'tiktok']),
      );
      const byUser = new Map<number, { yt?: typeof accounts[0]; tt?: typeof accounts[0] }>();
      for (const a of accounts) {
        const entry = byUser.get(a.userId) || {};
        if (a.platform === 'youtube' && !entry.yt) entry.yt = a;
        if (a.platform === 'tiktok' && !entry.tt) entry.tt = a;
        byUser.set(a.userId, entry);
      }
      let userId: number | null = null;
      let yt: typeof accounts[0] | undefined;
      let tt: typeof accounts[0] | undefined;
      for (const [uid, e] of byUser) {
        if (e.yt && e.tt) { userId = uid; yt = e.yt; tt = e.tt; break; }
      }
      if (!userId || !yt || !tt) {
        return reply.status(400).send({ error: 'No user with both YT and TikTok connected' });
      }

      const dl = await axios.get<ArrayBuffer>(body.videoUrl, { responseType: 'arraybuffer' });
      const buf = Buffer.from(dl.data);

      const key = `tests/${randomUUID()}.mp4`;
      await uploadToR2(key, buf, 'video/mp4');

      const delay = (body.scheduleInSeconds ?? 120) * 1000;
      const scheduledAt = new Date(Date.now() + delay).toISOString();

      const result = await db.transaction(async (tx) => {
        const [post] = await tx.insert(posts).values({
          userId: userId!,
          caption: body.caption || '',
          scheduledAt,
          status: 'scheduled',
        }).returning();

        await tx.insert(media).values({
          userId: userId!,
          postId: post.id,
          originalKey: key,
          mediaType: 'video',
          mimeType: 'video/mp4',
          fileSize: buf.length,
          sortOrder: 0,
          processingStatus: 'done',
        });

        await tx.insert(postPlatforms).values([
          { postId: post.id, platformAccountId: yt!.id },
          { postId: post.id, platformAccountId: tt!.id },
        ]);

        return post;
      });

      return { ok: true, postId: result.id, scheduledAt, r2Key: key, sizeBytes: buf.length };
    } catch (err: any) {
      app.log.error({ err: err.message }, 'schedule-test-post failed');
      return reply.status(500).send({ ok: false, error: err.message });
    }
  });

  // Direct one-shot smoke test of the TikTok Inbox publisher. Bypasses
  // the scheduler and the TIKTOK_INBOX_MODE flag — calls
  // publishToTikTokInbox in-process with a downloaded video URL.
  app.post('/api/admin/probe-tiktok-inbox', async (request, reply) => {
    const secret = process.env.ADMIN_SECRET || '';
    if (!secret) return reply.status(503).send({ error: 'ADMIN_SECRET not configured' });
    const provided = (request.headers['x-admin-secret'] || '') as string;
    if (provided !== secret) return reply.status(401).send({ error: 'Unauthorized' });

    const body = (request.body || {}) as { videoUrl?: string };
    if (!body.videoUrl) return reply.status(400).send({ error: 'videoUrl required' });

    const [tt] = await db.select().from(platformAccounts)
      .where(inArray(platformAccounts.platform, ['tiktok']))
      .limit(1);
    if (!tt) return reply.status(400).send({ error: 'No TikTok account connected' });

    try {
      const publishId = await publishToTikTokInbox({
        platformAccountId: tt.id,
        accessToken: tt.accessToken,
        refreshToken: tt.refreshToken,
        title: 'inbox-probe',
        description: '',
        mediaFiles: [{
          id: 0,
          mediaType: 'video',
          mimeType: 'video/mp4',
          publicUrl: body.videoUrl,
        }],
      });
      return { ok: true, publishId, accountName: tt.accountName };
    } catch (err: any) {
      app.log.error({ err: err.message }, 'probe-tiktok-inbox failed');
      return reply.status(500).send({ ok: false, error: err.message });
    }
  });

  // Lightweight read-only status check used by smoke tests to know when a
  // scheduled post finished publishing (or failed) without depending on a
  // logged-in JWT.
  app.get('/api/admin/post-status/:id', async (request, reply) => {
    const secret = process.env.ADMIN_SECRET || '';
    if (!secret) return reply.status(503).send({ error: 'ADMIN_SECRET not configured' });
    const provided = (request.headers['x-admin-secret'] || '') as string;
    if (provided !== secret) return reply.status(401).send({ error: 'Unauthorized' });

    const id = parseInt((request.params as { id: string }).id, 10);
    if (!id) return reply.status(400).send({ error: 'invalid id' });

    const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (!post) return reply.status(404).send({ error: 'not found' });

    const legs = await db.select({
      id: postPlatforms.id,
      status: postPlatforms.status,
      platformPostId: postPlatforms.platformPostId,
      errorMessage: postPlatforms.errorMessage,
      publishedAt: postPlatforms.publishedAt,
      platform: platformAccounts.platform,
      accountName: platformAccounts.accountName,
    })
      .from(postPlatforms)
      .innerJoin(platformAccounts, eq(platformAccounts.id, postPlatforms.platformAccountId))
      .where(eq(postPlatforms.postId, id));

    const logs = await db.select().from(publishLogs)
      .where(eq(publishLogs.postId, id))
      .orderBy(desc(publishLogs.createdAt))
      .limit(20);

    return { post, legs, logs };
  });
}
