import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, teardownTestDb, getTestDb, getAuthToken } from './setup.js';
import { media, users, posts } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

describe('Media routes — authz scoping', () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof getTestDb>;
  let userId: number;
  let otherUserId: number;
  let token: string;
  let otherToken: string;

  beforeEach(async () => {
    db = await setupTestDb();

    const hash = bcrypt.hashSync('password123', 10);
    const u1 = await db.insert(users).values({ email: 'a@t.com', passwordHash: hash }).returning();
    userId = u1[0].id;
    const u2 = await db.insert(users).values({ email: 'b@t.com', passwordHash: hash }).returning();
    otherUserId = u2[0].id;

    token = getAuthToken(userId, 'a@t.com');
    otherToken = getAuthToken(otherUserId, 'b@t.com');

    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    await teardownTestDb();
  });

  function authHeaders(t = token) {
    return { authorization: `Bearer ${t}` };
  }

  it('GET /api/media/:id returns the user own row', async () => {
    const m = await db.insert(media).values({
      userId, originalKey: 'k.png', mediaType: 'image', mimeType: 'image/png',
    }).returning();

    const res = await app.inject({ method: 'GET', url: `/api/media/${m[0].id}`, headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(m[0].id);
  });

  it('GET /api/media/:id returns 404 for another user row (authz)', async () => {
    const m = await db.insert(media).values({
      userId: otherUserId, originalKey: 'hers.png', mediaType: 'image', mimeType: 'image/png',
    }).returning();

    const res = await app.inject({ method: 'GET', url: `/api/media/${m[0].id}`, headers: authHeaders() });
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/media/:id/file/:type redirects only for the user own media', async () => {
    const mine = await db.insert(media).values({
      userId, originalKey: 'mine.png', watermarkedKey: 'mine-wm.png', mediaType: 'image', mimeType: 'image/png',
    }).returning();
    const hers = await db.insert(media).values({
      userId: otherUserId, originalKey: 'hers.png', mediaType: 'image', mimeType: 'image/png',
    }).returning();

    const ok = await app.inject({
      method: 'GET',
      url: `/api/media/${mine[0].id}/file/watermarked`,
      headers: authHeaders(),
    });
    expect(ok.statusCode).toBe(302);

    const denied = await app.inject({
      method: 'GET',
      url: `/api/media/${hers[0].id}/file/original`,
      headers: authHeaders(),
    });
    expect(denied.statusCode).toBe(404);
  });

  it('DELETE /api/media/:id refuses another user media (authz)', async () => {
    const hers = await db.insert(media).values({
      userId: otherUserId, originalKey: 'hers.png', mediaType: 'image', mimeType: 'image/png',
    }).returning();

    const res = await app.inject({ method: 'DELETE', url: `/api/media/${hers[0].id}`, headers: authHeaders() });
    expect(res.statusCode).toBe(404);

    // row still exists
    const after = await db.select().from(media).where(eq(media.id, hers[0].id));
    expect(after).toHaveLength(1);
  });

  it('POST /api/posts ignores mediaIds that belong to another user', async () => {
    const hers = await db.insert(media).values({
      userId: otherUserId, originalKey: 'hers.png', mediaType: 'image', mimeType: 'image/png',
    }).returning();

    const res = await app.inject({
      method: 'POST',
      url: '/api/posts',
      headers: authHeaders(),
      payload: {
        caption: 'hijack attempt',
        scheduledAt: '2030-04-15T10:00:00',
        platformAccountIds: [],
        mediaIds: [hers[0].id],
      },
    });
    expect(res.statusCode).toBe(200);

    // hers media must NOT have been re-parented
    const after = await db.select().from(media).where(eq(media.id, hers[0].id));
    expect(after[0].postId).toBeNull();
    expect(after[0].userId).toBe(otherUserId);
  });

  it('media routes without auth return 401', async () => {
    const m = await db.insert(media).values({
      userId, originalKey: 'k.png', mediaType: 'image', mimeType: 'image/png',
    }).returning();

    const res1 = await app.inject({ method: 'GET', url: `/api/media/${m[0].id}` });
    expect(res1.statusCode).toBe(401);
    const res2 = await app.inject({ method: 'DELETE', url: `/api/media/${m[0].id}` });
    expect(res2.statusCode).toBe(401);
  });
});
