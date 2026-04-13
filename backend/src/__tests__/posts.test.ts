import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, teardownTestDb, getTestDb } from './setup.js';
import { posts, postPlatforms, platformAccounts, users, publishLogs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

describe('Posts Data Layer', () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = setupTestDb();

    // Seed a test user
    const hash = bcrypt.hashSync('password123', 10);
    db.insert(users).values({ email: 'test@test.com', passwordHash: hash }).run();

    // Seed a platform account
    db.insert(platformAccounts).values({
      userId: 1,
      platform: 'facebook',
      accountName: 'Test Page',
      accountId: 'fb-123',
      accessToken: 'token-abc',
    }).run();
  });

  afterEach(() => {
    teardownTestDb();
  });

  it('creates a post', () => {
    const post = db.insert(posts).values({
      userId: 1,
      caption: 'Hello World',
      scheduledAt: '2026-04-15T10:00:00',
      status: 'scheduled',
    }).returning().get();

    expect(post.id).toBe(1);
    expect(post.caption).toBe('Hello World');
    expect(post.status).toBe('scheduled');
  });

  it('creates a post with platform links', () => {
    const post = db.insert(posts).values({
      userId: 1,
      caption: 'Post with platforms',
      scheduledAt: '2026-04-15T10:00:00',
      status: 'scheduled',
    }).returning().get();

    db.insert(postPlatforms).values({
      postId: post.id,
      platformAccountId: 1,
    }).run();

    const linked = db.select().from(postPlatforms)
      .where(eq(postPlatforms.postId, post.id)).all();

    expect(linked).toHaveLength(1);
    expect(linked[0].platformAccountId).toBe(1);
    expect(linked[0].status).toBe('pending');
  });

  it('lists posts by user', () => {
    db.insert(posts).values({ userId: 1, caption: 'Post 1', scheduledAt: '2026-04-15T10:00:00', status: 'scheduled' }).run();
    db.insert(posts).values({ userId: 1, caption: 'Post 2', scheduledAt: '2026-04-16T10:00:00', status: 'draft' }).run();

    const result = db.select().from(posts).where(eq(posts.userId, 1)).all();
    expect(result).toHaveLength(2);
  });

  it('updates a scheduled post', () => {
    db.insert(posts).values({ userId: 1, caption: 'Original', scheduledAt: '2026-04-15T10:00:00', status: 'scheduled' }).run();

    db.update(posts)
      .set({ caption: 'Updated', updatedAt: new Date().toISOString() })
      .where(eq(posts.id, 1))
      .run();

    const updated = db.select().from(posts).where(eq(posts.id, 1)).get();
    expect(updated?.caption).toBe('Updated');
  });

  it('does not allow invalid status', () => {
    expect(() => {
      db.insert(posts).values({
        userId: 1,
        caption: 'Bad post',
        scheduledAt: '2026-04-15T10:00:00',
        status: 'invalid_status' as any,
      }).run();
    }).toThrow();
  });

  it('deletes a post and cascades platform links', () => {
    const post = db.insert(posts).values({
      userId: 1, caption: 'To delete', scheduledAt: '2026-04-15T10:00:00', status: 'scheduled',
    }).returning().get();

    db.insert(postPlatforms).values({ postId: post.id, platformAccountId: 1 }).run();

    // Delete platform links first (manual cascade)
    db.delete(postPlatforms).where(eq(postPlatforms.postId, post.id)).run();
    db.delete(posts).where(eq(posts.id, post.id)).run();

    expect(db.select().from(posts).where(eq(posts.id, post.id)).get()).toBeUndefined();
    expect(db.select().from(postPlatforms).where(eq(postPlatforms.postId, post.id)).all()).toHaveLength(0);
  });

  it('stores publish logs', () => {
    const post = db.insert(posts).values({
      userId: 1, caption: 'Logged post', scheduledAt: '2026-04-15T10:00:00', status: 'published',
    }).returning().get();

    db.insert(publishLogs).values({
      postId: post.id,
      platform: 'facebook',
      level: 'info',
      message: 'Published successfully',
    }).run();

    db.insert(publishLogs).values({
      postId: post.id,
      platform: 'instagram',
      level: 'error',
      message: 'Failed to publish',
      details: 'Token expired',
    }).run();

    const logs = db.select().from(publishLogs).where(eq(publishLogs.postId, post.id)).all();
    expect(logs).toHaveLength(2);
    expect(logs[0].message).toBe('Published successfully');
    expect(logs[1].level).toBe('error');
    expect(logs[1].details).toBe('Token expired');
  });

  it('filters posts by status', () => {
    db.insert(posts).values({ userId: 1, caption: 'Scheduled', scheduledAt: '2026-04-15T10:00:00', status: 'scheduled' }).run();
    db.insert(posts).values({ userId: 1, caption: 'Published', scheduledAt: '2026-04-14T10:00:00', status: 'published' }).run();
    db.insert(posts).values({ userId: 1, caption: 'Failed', scheduledAt: '2026-04-13T10:00:00', status: 'failed' }).run();

    const all = db.select().from(posts).where(eq(posts.userId, 1)).all();
    expect(all).toHaveLength(3);

    const scheduled = all.filter(p => p.status === 'scheduled');
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].caption).toBe('Scheduled');
  });
});
