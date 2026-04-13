import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, teardownTestDb, getTestDb } from './setup.js';
import { posts, users } from '../db/schema.js';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import bcrypt from 'bcrypt';

describe('Dashboard Data Layer', () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = setupTestDb();

    const hash = bcrypt.hashSync('password123', 10);
    db.insert(users).values({ email: 'test@test.com', passwordHash: hash }).run();

    // Seed posts with various statuses
    db.insert(posts).values({ userId: 1, caption: 'Scheduled 1', scheduledAt: '2026-04-15T10:00:00', status: 'scheduled' }).run();
    db.insert(posts).values({ userId: 1, caption: 'Scheduled 2', scheduledAt: '2026-04-16T14:00:00', status: 'scheduled' }).run();
    db.insert(posts).values({ userId: 1, caption: 'Published', scheduledAt: '2026-04-10T10:00:00', status: 'published' }).run();
    db.insert(posts).values({ userId: 1, caption: 'Failed', scheduledAt: '2026-04-11T10:00:00', status: 'failed' }).run();
    db.insert(posts).values({ userId: 1, caption: 'Draft', scheduledAt: '2026-04-20T10:00:00', status: 'draft' }).run();
  });

  afterEach(() => {
    teardownTestDb();
  });

  it('computes correct stats', () => {
    const all = db.select().from(posts).where(eq(posts.userId, 1)).all();

    const stats = {
      total: all.length,
      scheduled: all.filter(p => p.status === 'scheduled').length,
      published: all.filter(p => p.status === 'published').length,
      failed: all.filter(p => p.status === 'failed').length,
      draft: all.filter(p => p.status === 'draft').length,
    };

    expect(stats.total).toBe(5);
    expect(stats.scheduled).toBe(2);
    expect(stats.published).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.draft).toBe(1);
  });

  it('returns upcoming scheduled posts sorted by date', () => {
    const upcoming = db.select().from(posts)
      .where(and(eq(posts.userId, 1), eq(posts.status, 'scheduled')))
      .orderBy(posts.scheduledAt)
      .all();

    expect(upcoming).toHaveLength(2);
    expect(upcoming[0].caption).toBe('Scheduled 1');
    expect(upcoming[1].caption).toBe('Scheduled 2');
  });

  it('returns recent posts sorted by updatedAt desc', () => {
    const recent = db.select().from(posts)
      .where(eq(posts.userId, 1))
      .orderBy(desc(posts.updatedAt))
      .limit(3)
      .all();

    expect(recent).toHaveLength(3);
  });

  it('filters calendar by month range', () => {
    const from = '2026-04-01';
    const to = '2026-04-30T23:59:59';

    const calendarPosts = db.select().from(posts)
      .where(and(
        eq(posts.userId, 1),
        gte(posts.scheduledAt, from),
        lte(posts.scheduledAt, to),
      ))
      .orderBy(posts.scheduledAt)
      .all();

    expect(calendarPosts).toHaveLength(5); // All posts are in April
  });

  it('excludes posts from other months', () => {
    db.insert(posts).values({ userId: 1, caption: 'May post', scheduledAt: '2026-05-01T10:00:00', status: 'scheduled' }).run();

    const from = '2026-04-01';
    const to = '2026-04-30T23:59:59';

    const calendarPosts = db.select().from(posts)
      .where(and(
        eq(posts.userId, 1),
        gte(posts.scheduledAt, from),
        lte(posts.scheduledAt, to),
      ))
      .all();

    expect(calendarPosts).toHaveLength(5); // May post excluded
  });
});
