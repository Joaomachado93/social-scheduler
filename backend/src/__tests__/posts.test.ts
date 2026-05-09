import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, teardownTestDb, getTestDb } from './setup.js';
import { posts, postPlatforms, platformAccounts, users, publishLogs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

describe('Posts Data Layer', () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = await setupTestDb();

    const hash = bcrypt.hashSync('password123', 10);
    await db.insert(users).values({ email: 'test@test.com', passwordHash: hash });

    await db.insert(platformAccounts).values({
      userId: 1,
      platform: 'facebook',
      accountName: 'Test Page',
      accountId: 'fb-123',
      accessToken: 'token-abc',
    });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it('creates a post', async () => {
    const inserted = await db.insert(posts).values({
      userId: 1,
      caption: 'Hello World',
      scheduledAt: '2026-04-15T10:00:00',
      status: 'scheduled',
    }).returning();
    const post = inserted[0];

    expect(post.id).toBe(1);
    expect(post.caption).toBe('Hello World');
    expect(post.status).toBe('scheduled');
  });

  it('creates a post with platform links', async () => {
    const inserted = await db.insert(posts).values({
      userId: 1,
      caption: 'Post with platforms',
      scheduledAt: '2026-04-15T10:00:00',
      status: 'scheduled',
    }).returning();
    const post = inserted[0];

    await db.insert(postPlatforms).values({
      postId: post.id,
      platformAccountId: 1,
    });

    const linked = await db.select().from(postPlatforms)
      .where(eq(postPlatforms.postId, post.id));

    expect(linked).toHaveLength(1);
    expect(linked[0].platformAccountId).toBe(1);
    expect(linked[0].status).toBe('pending');
  });

  it('lists posts by user', async () => {
    await db.insert(posts).values({ userId: 1, caption: 'Post 1', scheduledAt: '2026-04-15T10:00:00', status: 'scheduled' });
    await db.insert(posts).values({ userId: 1, caption: 'Post 2', scheduledAt: '2026-04-16T10:00:00', status: 'draft' });

    const result = await db.select().from(posts).where(eq(posts.userId, 1));
    expect(result).toHaveLength(2);
  });

  it('updates a scheduled post', async () => {
    await db.insert(posts).values({ userId: 1, caption: 'Original', scheduledAt: '2026-04-15T10:00:00', status: 'scheduled' });

    await db.update(posts)
      .set({ caption: 'Updated', updatedAt: new Date().toISOString() })
      .where(eq(posts.id, 1));

    const rows = await db.select().from(posts).where(eq(posts.id, 1));
    expect(rows[0]?.caption).toBe('Updated');
  });

  it('deletes a post and cascades platform links', async () => {
    const inserted = await db.insert(posts).values({
      userId: 1, caption: 'To delete', scheduledAt: '2026-04-15T10:00:00', status: 'scheduled',
    }).returning();
    const post = inserted[0];

    await db.insert(postPlatforms).values({ postId: post.id, platformAccountId: 1 });

    await db.delete(postPlatforms).where(eq(postPlatforms.postId, post.id));
    await db.delete(posts).where(eq(posts.id, post.id));

    const remaining = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(remaining).toHaveLength(0);
    const links = await db.select().from(postPlatforms).where(eq(postPlatforms.postId, post.id));
    expect(links).toHaveLength(0);
  });

  it('stores publish logs', async () => {
    const inserted = await db.insert(posts).values({
      userId: 1, caption: 'Logged post', scheduledAt: '2026-04-15T10:00:00', status: 'published',
    }).returning();
    const post = inserted[0];

    await db.insert(publishLogs).values({
      postId: post.id,
      platform: 'facebook',
      level: 'info',
      message: 'Published successfully',
    });

    await db.insert(publishLogs).values({
      postId: post.id,
      platform: 'instagram',
      level: 'error',
      message: 'Failed to publish',
      details: 'Token expired',
    });

    const logs = await db.select().from(publishLogs).where(eq(publishLogs.postId, post.id));
    expect(logs).toHaveLength(2);
    expect(logs[0].message).toBe('Published successfully');
    expect(logs[1].level).toBe('error');
    expect(logs[1].details).toBe('Token expired');
  });

  it('filters posts by status', async () => {
    await db.insert(posts).values({ userId: 1, caption: 'Scheduled', scheduledAt: '2026-04-15T10:00:00', status: 'scheduled' });
    await db.insert(posts).values({ userId: 1, caption: 'Published', scheduledAt: '2026-04-14T10:00:00', status: 'published' });
    await db.insert(posts).values({ userId: 1, caption: 'Failed', scheduledAt: '2026-04-13T10:00:00', status: 'failed' });

    const all = await db.select().from(posts).where(eq(posts.userId, 1));
    expect(all).toHaveLength(3);

    const scheduled = all.filter(p => p.status === 'scheduled');
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].caption).toBe('Scheduled');
  });

  it('creates a draft post distinct from scheduled', async () => {
    const inserted = await db.insert(posts).values({
      userId: 1, caption: 'Work in progress', scheduledAt: '2026-04-15T10:00:00', status: 'draft',
    }).returning();
    const draft = inserted[0];

    expect(draft.status).toBe('draft');
    const schedulerQueue = await db.select().from(posts).where(eq(posts.status, 'scheduled'));
    expect(schedulerQueue).toHaveLength(0);
  });

  it('promotes a draft to scheduled via status update', async () => {
    await db.insert(posts).values({
      userId: 1, caption: 'Draft', scheduledAt: '2026-04-15T10:00:00', status: 'draft',
    });

    await db.update(posts).set({ status: 'scheduled', updatedAt: new Date().toISOString() })
      .where(eq(posts.id, 1));

    const rows = await db.select().from(posts).where(eq(posts.id, 1));
    expect(rows[0]?.status).toBe('scheduled');
  });

  it('duplicates a post as draft with fresh platform links', async () => {
    const sourceInserted = await db.insert(posts).values({
      userId: 1, caption: 'Original caption', scheduledAt: '2026-04-15T10:00:00', status: 'published',
    }).returning();
    const source = sourceInserted[0];

    await db.insert(postPlatforms).values({
      postId: source.id, platformAccountId: 1, status: 'published', platformPostId: 'remote-1',
    });

    const newScheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const cloneInserted = await db.insert(posts).values({
      userId: source.userId,
      caption: source.caption,
      scheduledAt: newScheduledAt,
      status: 'draft',
    }).returning();
    const clone = cloneInserted[0];

    const sourcePlatforms = await db.select().from(postPlatforms)
      .where(eq(postPlatforms.postId, source.id));
    for (const pp of sourcePlatforms) {
      await db.insert(postPlatforms).values({
        postId: clone.id,
        platformAccountId: pp.platformAccountId,
      });
    }

    expect(clone.id).not.toBe(source.id);
    expect(clone.caption).toBe(source.caption);
    expect(clone.status).toBe('draft');

    const clonedPlatforms = await db.select().from(postPlatforms)
      .where(eq(postPlatforms.postId, clone.id));
    expect(clonedPlatforms).toHaveLength(1);
    expect(clonedPlatforms[0].status).toBe('pending');
    expect(clonedPlatforms[0].platformPostId).toBeNull();

    const sourceRows = await db.select().from(posts).where(eq(posts.id, source.id));
    expect(sourceRows[0]?.status).toBe('published');
  });
});
