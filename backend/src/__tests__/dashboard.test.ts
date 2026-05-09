import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, teardownTestDb, getTestDb } from './setup.js';
import { posts, users } from '../db/schema.js';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import bcrypt from 'bcrypt';

describe('Dashboard Data Layer', () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = await setupTestDb();

    const hash = bcrypt.hashSync('password123', 10);
    await db.insert(users).values({ email: 'test@test.com', passwordHash: hash });

    await db.insert(posts).values({ userId: 1, caption: 'Scheduled 1', scheduledAt: '2026-04-15T10:00:00', status: 'scheduled' });
    await db.insert(posts).values({ userId: 1, caption: 'Scheduled 2', scheduledAt: '2026-04-16T14:00:00', status: 'scheduled' });
    await db.insert(posts).values({ userId: 1, caption: 'Published', scheduledAt: '2026-04-10T10:00:00', status: 'published' });
    await db.insert(posts).values({ userId: 1, caption: 'Failed', scheduledAt: '2026-04-11T10:00:00', status: 'failed' });
    await db.insert(posts).values({ userId: 1, caption: 'Draft', scheduledAt: '2026-04-20T10:00:00', status: 'draft' });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it('computes correct stats', async () => {
    const all = await db.select().from(posts).where(eq(posts.userId, 1));

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

  it('returns upcoming scheduled posts sorted by date', async () => {
    const upcoming = await db.select().from(posts)
      .where(and(eq(posts.userId, 1), eq(posts.status, 'scheduled')))
      .orderBy(posts.scheduledAt);

    expect(upcoming).toHaveLength(2);
    expect(upcoming[0].caption).toBe('Scheduled 1');
    expect(upcoming[1].caption).toBe('Scheduled 2');
  });

  it('returns recent posts sorted by updatedAt desc', async () => {
    const recent = await db.select().from(posts)
      .where(eq(posts.userId, 1))
      .orderBy(desc(posts.updatedAt))
      .limit(3);

    expect(recent).toHaveLength(3);
  });

  it('filters calendar by month range', async () => {
    const from = '2026-04-01';
    const to = '2026-04-30T23:59:59';

    const calendarPosts = await db.select().from(posts)
      .where(and(
        eq(posts.userId, 1),
        gte(posts.scheduledAt, from),
        lte(posts.scheduledAt, to),
      ))
      .orderBy(posts.scheduledAt);

    expect(calendarPosts).toHaveLength(5);
  });

  it('excludes posts from other months', async () => {
    await db.insert(posts).values({ userId: 1, caption: 'May post', scheduledAt: '2026-05-01T10:00:00', status: 'scheduled' });

    const from = '2026-04-01';
    const to = '2026-04-30T23:59:59';

    const calendarPosts = await db.select().from(posts)
      .where(and(
        eq(posts.userId, 1),
        gte(posts.scheduledAt, from),
        lte(posts.scheduledAt, to),
      ));

    expect(calendarPosts).toHaveLength(5);
  });
});
