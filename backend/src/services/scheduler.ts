import cron from 'node-cron';
import { db } from '../db/index.js';
import { posts, postPlatforms, media, platformAccounts, publishLogs } from '../db/schema.js';
import { eq, and, lte, inArray } from 'drizzle-orm';
import { publishToFacebook } from './publishers/facebook.js';
import { publishToInstagram, type PublisherMedia } from './publishers/instagram.js';
import { publishToYouTube } from './publishers/youtube.js';
import { getPublicUrl } from './storage.js';
import { cleanupMediaForPost, cleanupOrphanedMedia } from './cleanup.js';

export function startScheduler() {
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 60_000);

    const duePosts = await db.select().from(posts)
      .where(and(
        eq(posts.status, 'scheduled'),
        lte(posts.scheduledAt, windowEnd.toISOString()),
      ));

    for (const post of duePosts) {
      await db.update(posts)
        .set({ status: 'processing' })
        .where(eq(posts.id, post.id));

      try {
        await publishPost(post);
      } catch (err) {
        console.error(`Failed to publish post ${post.id}:`, err);
      }
    }
  });

  // Daily janitor at 03:00 — reaps media for stale failed/partial/draft posts and orphans
  cron.schedule('0 3 * * *', async () => {
    try {
      const { removed } = await cleanupOrphanedMedia();
      if (removed > 0) console.log(`[cleanup] removed ${removed} orphaned media files`);
    } catch (err) {
      console.error('[cleanup] failed:', err);
    }
  });

  console.log('Scheduler started - checking every minute');
}

export async function publishPost(post: { id: number; caption: string | null; scheduledAt: string }) {
  // Only re-attempt legs that are pending or previously failed.
  // Skipping 'published' legs prevents duplicate posts on the platform on retry.
  const targets = await db.select().from(postPlatforms)
    .where(and(
      eq(postPlatforms.postId, post.id),
      inArray(postPlatforms.status, ['pending', 'failed']),
    ));

  const mediaRows = await db.select().from(media)
    .where(eq(media.postId, post.id));

  const publisherMedia: PublisherMedia[] = mediaRows.map(m => {
    const useWatermarked = m.processingStatus === 'done' && !!m.watermarkedKey;
    return {
      id: m.id,
      mediaType: m.mediaType,
      mimeType: m.mimeType,
      publicUrl: getPublicUrl(useWatermarked ? m.watermarkedKey! : m.originalKey),
    };
  });

  if (targets.length === 0) {
    await db.update(posts).set({ status: 'failed' }).where(eq(posts.id, post.id));
    await logPublish(post.id, null, 'error', 'No target platforms configured');
    return;
  }

  const results = await Promise.allSettled(
    targets.map(async (target) => {
      const accountRows = await db.select().from(platformAccounts)
        .where(eq(platformAccounts.id, target.platformAccountId))
        .limit(1);
      const account = accountRows[0];

      if (!account) throw new Error('Platform account not found');

      await db.update(postPlatforms)
        .set({ status: 'publishing', errorMessage: null })
        .where(eq(postPlatforms.id, target.id));

      let platformPostId: string;

      switch (account.platform) {
        case 'facebook':
          platformPostId = await publishToFacebook(
            account.accountId,
            account.accessToken,
            post.caption || '',
            publisherMedia,
          );
          break;

        case 'instagram':
          platformPostId = await publishToInstagram(
            account.accountId,
            account.accessToken,
            post.caption || '',
            publisherMedia,
          );
          break;

        case 'youtube':
          platformPostId = await publishToYouTube(
            account.id,
            account.accessToken,
            account.refreshToken,
            post.caption?.split('\n')[0] || 'Untitled',
            post.caption || '',
            publisherMedia,
          );
          break;

        default:
          throw new Error(`Unknown platform: ${account.platform}`);
      }

      await db.update(postPlatforms).set({
        status: 'published',
        platformPostId,
        publishedAt: new Date().toISOString(),
      }).where(eq(postPlatforms.id, target.id));

      await logPublish(post.id, account.platform, 'info', `Published successfully. ID: ${platformPostId}`);

      return platformPostId;
    })
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'rejected') {
      const errMsg = (r.reason as any)?.message || 'Unknown error';
      await db.update(postPlatforms).set({
        status: 'failed',
        errorMessage: errMsg,
      }).where(eq(postPlatforms.id, targets[i].id));

      const accountRows = await db.select().from(platformAccounts)
        .where(eq(platformAccounts.id, targets[i].platformAccountId))
        .limit(1);
      const account = accountRows[0];
      await logPublish(post.id, account?.platform || null, 'error', errMsg);
    }
  }

  // Recompute status from ALL legs, including ones we skipped (already-published)
  const allLegs = await db.select().from(postPlatforms).where(eq(postPlatforms.postId, post.id));
  const everyPublished = allLegs.every(p => p.status === 'published');
  const everyFailed = allLegs.every(p => p.status === 'failed');
  const anyPublished = allLegs.some(p => p.status === 'published');

  const finalStatus = everyPublished
    ? 'published'
    : everyFailed
      ? 'failed'
      : anyPublished
        ? 'partial'
        : 'failed';

  await db.update(posts).set({
    status: finalStatus,
    updatedAt: new Date().toISOString(),
  }).where(eq(posts.id, post.id));

  // Free R2 storage as soon as all platforms received the file successfully
  if (everyPublished) {
    try {
      await cleanupMediaForPost(post.id);
    } catch (err) {
      console.warn(`[cleanup] post ${post.id} R2 cleanup failed:`, err);
    }
  }
}

async function logPublish(postId: number, platform: string | null, level: string, message: string) {
  await db.insert(publishLogs).values({
    postId,
    platform,
    level,
    message,
  });
}
