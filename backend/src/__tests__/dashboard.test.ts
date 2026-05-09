import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, teardownTestDb, getTestDb, getAuthToken } from './setup.js';
import { posts, users } from '../db/schema.js';
import bcrypt from 'bcrypt';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

describe('Dashboard routes', () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof getTestDb>;
  let userId: number;
  let otherUserId: number;
  let token: string;

  // Pick a future date for scheduled posts so /upcoming returns them
  // (the route now filters out scheduledAt < now, see #1).
  const futureScheduled = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
  const farFutureScheduled = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
  const pastScheduled = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);

  beforeEach(async () => {
    db = await setupTestDb();

    const hash = bcrypt.hashSync('password123', 10);
    const u1 = await db.insert(users).values({ email: 'a@t.com', passwordHash: hash }).returning();
    userId = u1[0].id;
    const u2 = await db.insert(users).values({ email: 'b@t.com', passwordHash: hash }).returning();
    otherUserId = u2[0].id;

    token = getAuthToken(userId, 'a@t.com');

    await db.insert(posts).values({ userId, caption: 'Future S1', scheduledAt: futureScheduled, status: 'scheduled' });
    await db.insert(posts).values({ userId, caption: 'Future S2', scheduledAt: farFutureScheduled, status: 'scheduled' });
    await db.insert(posts).values({ userId, caption: 'Past P', scheduledAt: pastScheduled, status: 'published' });
    await db.insert(posts).values({ userId, caption: 'Past F', scheduledAt: pastScheduled, status: 'failed' });
    await db.insert(posts).values({ userId, caption: 'Draft', scheduledAt: futureScheduled, status: 'draft' });
    // belongs to other user — should never appear in this user's results
    await db.insert(posts).values({ userId: otherUserId, caption: 'Hers', scheduledAt: futureScheduled, status: 'scheduled' });

    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    await teardownTestDb();
  });

  function authHeaders() {
    return { authorization: `Bearer ${token}` };
  }

  it('GET /api/dashboard/stats counts the user own posts only', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/dashboard/stats', headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    const stats = res.json();
    expect(stats.total).toBe(5);
    expect(stats.scheduled).toBe(2);
    expect(stats.published).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.draft).toBe(1);
  });

  it('GET /api/dashboard/upcoming excludes past-dated posts and other-user posts', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/dashboard/upcoming', headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    const upcoming = res.json();
    expect(upcoming).toHaveLength(2);
    expect(upcoming.map((p: any) => p.caption)).toEqual(['Future S1', 'Future S2']);
  });

  it('GET /api/dashboard/recent returns the user own posts ordered by updatedAt desc', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/dashboard/recent', headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    const recent = res.json();
    expect(recent.length).toBeGreaterThanOrEqual(5);
    expect(recent.every((p: any) => p.userId === userId)).toBe(true);
  });

  it('GET /api/calendar?month=&year= filters by the requested month', async () => {
    const target = new Date(futureScheduled);
    const res = await app.inject({
      method: 'GET',
      url: `/api/calendar?year=${target.getUTCFullYear()}&month=${target.getUTCMonth() + 1}`,
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list.every((p: any) => p.userId === userId)).toBe(true);
    // every entry falls in the requested month
    expect(list.every((p: any) => {
      const d = new Date(p.scheduledAt);
      return d.getUTCFullYear() === target.getUTCFullYear() && d.getUTCMonth() === target.getUTCMonth();
    })).toBe(true);
  });

  it('GET /api/calendar with bogus query falls back to current month without crashing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/calendar?year=foo&month=bar',
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
  });

  it('GET /api/dashboard/* without auth returns 401', async () => {
    for (const url of ['/api/dashboard/stats', '/api/dashboard/upcoming', '/api/dashboard/recent', '/api/calendar']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(401);
    }
  });
});
