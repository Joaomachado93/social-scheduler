import cron from 'node-cron';
import { db } from '../db/index.js';
import { posts, postPlatforms, media, platformAccounts, publishLogs } from '../db/schema.js';
import { eq, and, lte, gte } from 'drizzle-orm';
import { publishToFacebook } from './publishers/facebook.js';
import { publishToInstagram } from './publishers/instagram.js';
import { publishToYouTube } from './publishers/youtube.js';

export function startScheduler() {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 60_000);

    const duePosts = db.select().from(posts)
      .where(and(
        eq(posts.status, 'scheduled'),
        lte(posts.scheduledAt, windowEnd.toISOString()),
      ))
      .all()
      .filter(p => p.scheduledAt <= windowEnd.toISOString());

    for (const post of duePosts) {
      db.update(posts)
        .set({ status: 'processing' })
        .where(eq(posts.id, post.id))
        .run();

      try {
        await publishPost(post);
      } catch (err) {
        console.error(`Failed to publish post ${post.id}:`, err);
      }
    }
  });

  console.log('Scheduler started - checking every minute');
}

export async function publishPost(post: { id: number; caption: string | null; scheduledAt: string }) {
  const targets = db.select().from(postPlatforms)
    .where(eq(postPlatforms.postId, post.id))
    .all();

  const mediaFiles = db.select().from(media)
    .where(eq(media.postId, post.id))
    .all();

  if (targets.length === 0) {
    db.update(posts).set({ status: 'failed' }).where(eq(posts.id, post.id)).run();
    logPublish(post.id, null, 'error', 'No target platforms configured');
    return;
  }

  const results = await Promise.allSettled(
    targets.map(async (target) => {
      const account = db.select().from(platformAccounts)
        .where(eq(platformAccounts.id, target.platformAccountId))
        .get();

      if (!account) throw new Error('Platform account not found');

      db.update(postPlatforms)
        .set({ status: 'publishing' })
        .where(eq(postPlatforms.id, target.id))
        .run();

      let platformPostId: string;

      switch (account.platform) {
        case 'facebook':
          platformPostId = await publishToFacebook(
            account.accountId,
            account.accessToken,
            post.caption || '',
            mediaFiles,
          );
          break;

        case 'instagram':
          platformPostId = await publishToInstagram(
            account.accountId,
            account.accessToken,
            post.caption || '',
            mediaFiles.map(m => ({ ...m, id: m.id })),
          );
          break;

        case 'youtube':
          platformPostId = await publishToYouTube(
            account.id,
            account.accessToken,
            account.refreshToken,
            post.caption?.split('\n')[0] || 'Untitled', // First line as title
            post.caption || '',
            mediaFiles,
          );
          break;

        default:
          throw new Error(`Unknown platform: ${account.platform}`);
      }

      db.update(postPlatforms).set({
        status: 'published',
        platformPostId,
        publishedAt: new Date().toISOString(),
      }).where(eq(postPlatforms.id, target.id)).run();

      logPublish(post.id, account.platform, 'info', `Published successfully. ID: ${platformPostId}`);

      return platformPostId;
    })
  );

  const allPublished = results.every(r => r.status === 'fulfilled');
  const allFailed = results.every(r => r.status === 'rejected');

  // Update failed targets
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const errMsg = r.reason?.message || 'Unknown error';
      db.update(postPlatforms).set({
        status: 'failed',
        errorMessage: errMsg,
      }).where(eq(postPlatforms.id, targets[i].id)).run();

      const account = db.select().from(platformAccounts)
        .where(eq(platformAccounts.id, targets[i].platformAccountId)).get();
      logPublish(post.id, account?.platform || null, 'error', errMsg);
    }
  });

  db.update(posts).set({
    status: allPublished ? 'published' : allFailed ? 'failed' : 'partial',
    updatedAt: new Date().toISOString(),
  }).where(eq(posts.id, post.id)).run();
}

function logPublish(postId: number, platform: string | null, level: string, message: string) {
  db.insert(publishLogs).values({
    postId,
    platform,
    level,
    message,
  }).run();
}
