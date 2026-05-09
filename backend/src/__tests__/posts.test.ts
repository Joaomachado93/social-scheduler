import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, teardownTestDb, getTestDb, getAuthToken } from './setup.js';
import { posts, postPlatforms, platformAccounts, users, publishLogs, media } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

describe('Posts routes', () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof getTestDb>;
  let userId: number;
  let otherUserId: number;
  let token: string;
  let otherToken: string;
  let platformAccountId: number;

  beforeEach(async () => {
    db = await setupTestDb();

    const hash = bcrypt.hashSync('password123', 10);
    const u1 = await db.insert(users).values({ email: 'a@t.com', passwordHash: hash }).returning();
    userId = u1[0].id;
    const u2 = await db.insert(users).values({ email: 'b@t.com', passwordHash: hash }).returning();
    otherUserId = u2[0].id;

    const pa = await db.insert(platformAccounts).values({
      userId,
      platform: 'facebook',
      accountName: 'Test Page',
      accountId: 'fb-123',
      accessToken: 'token-abc',
    }).returning();
    platformAccountId = pa[0].id;

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

  it('POST /api/posts creates a post (transactional, with platforms + media)', async () => {
    const mediaRow = await db.insert(media).values({
      originalKey: 'original/x.png',
      watermarkedKey: 'watermarked/x.png',
      mediaType: 'image',
      mimeType: 'image/png',
    }).returning();

    const res = await app.inject({
      method: 'POST',
      url: '/api/posts',
      headers: authHeaders(),
      payload: {
        caption: 'Hello',
        scheduledAt: '2030-04-15T10:00:00',
        platformAccountIds: [platformAccountId],
        mediaIds: [mediaRow[0].id],
        status: 'scheduled',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.caption).toBe('Hello');
    expect(body.status).toBe('scheduled');

    const links = await db.select().from(postPlatforms).where(eq(postPlatforms.postId, body.id));
    expect(links).toHaveLength(1);

    const mediaAttached = await db.select().from(media).where(eq(media.id, mediaRow[0].id));
    expect(mediaAttached[0].postId).toBe(body.id);
  });

  it('POST /api/posts without status defaults to scheduled', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/posts',
      headers: authHeaders(),
      payload: { caption: 'X', scheduledAt: '2030-04-15T10:00:00', platformAccountIds: [], mediaIds: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('scheduled');
  });

  it('POST /api/posts with status=draft creates draft', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/posts',
      headers: authHeaders(),
      payload: { caption: 'D', scheduledAt: '2030-04-15T10:00:00', platformAccountIds: [], mediaIds: [], status: 'draft' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('draft');
  });

  it('GET /api/posts returns only the user own posts', async () => {
    await db.insert(posts).values({ userId, caption: 'Mine', scheduledAt: '2030-04-15T10:00:00', status: 'scheduled' });
    await db.insert(posts).values({ userId: otherUserId, caption: 'Hers', scheduledAt: '2030-04-15T10:00:00', status: 'scheduled' });

    const res = await app.inject({ method: 'GET', url: '/api/posts', headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list).toHaveLength(1);
    expect(list[0].caption).toBe('Mine');
  });

  it('GET /api/posts filters by status', async () => {
    await db.insert(posts).values({ userId, caption: 'S', scheduledAt: '2030-04-15T10:00:00', status: 'scheduled' });
    await db.insert(posts).values({ userId, caption: 'P', scheduledAt: '2030-04-14T10:00:00', status: 'published' });

    const res = await app.inject({ method: 'GET', url: '/api/posts?status=published', headers: authHeaders() });
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].caption).toBe('P');
  });

  it('GET /api/posts/:id returns post with platforms and media', async () => {
    const inserted = await db.insert(posts).values({
      userId, caption: 'Detail', scheduledAt: '2030-04-15T10:00:00', status: 'scheduled',
    }).returning();
    await db.insert(postPlatforms).values({ postId: inserted[0].id, platformAccountId });

    const res = await app.inject({
      method: 'GET',
      url: `/api/posts/${inserted[0].id}`,
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.caption).toBe('Detail');
    expect(body.platforms).toHaveLength(1);
    expect(body.platforms[0].platform).toBe('facebook');
  });

  it('GET /api/posts/:id refuses another user post', async () => {
    const inserted = await db.insert(posts).values({
      userId: otherUserId, caption: 'Hers', scheduledAt: '2030-04-15T10:00:00', status: 'scheduled',
    }).returning();

    const res = await app.inject({
      method: 'GET',
      url: `/api/posts/${inserted[0].id}`,
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });

  it('PUT /api/posts/:id updates an editable post', async () => {
    const inserted = await db.insert(posts).values({
      userId, caption: 'Old', scheduledAt: '2030-04-15T10:00:00', status: 'draft',
    }).returning();

    const res = await app.inject({
      method: 'PUT',
      url: `/api/posts/${inserted[0].id}`,
      headers: authHeaders(),
      payload: { caption: 'New', status: 'scheduled' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().caption).toBe('New');
    expect(res.json().status).toBe('scheduled');
  });

  it('PUT /api/posts/:id rejects non-editable statuses', async () => {
    const inserted = await db.insert(posts).values({
      userId, caption: 'Sent', scheduledAt: '2030-04-15T10:00:00', status: 'published',
    }).returning();

    const res = await app.inject({
      method: 'PUT',
      url: `/api/posts/${inserted[0].id}`,
      headers: authHeaders(),
      payload: { caption: 'Try update' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE /api/posts/:id cascades platform links + detaches media', async () => {
    const inserted = await db.insert(posts).values({
      userId, caption: 'Bye', scheduledAt: '2030-04-15T10:00:00', status: 'scheduled',
    }).returning();
    await db.insert(postPlatforms).values({ postId: inserted[0].id, platformAccountId });
    const mediaRow = await db.insert(media).values({
      postId: inserted[0].id, originalKey: 'k.png', mediaType: 'image', mimeType: 'image/png',
    }).returning();

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/posts/${inserted[0].id}`,
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);

    expect(await db.select().from(posts).where(eq(posts.id, inserted[0].id))).toHaveLength(0);
    expect(await db.select().from(postPlatforms).where(eq(postPlatforms.postId, inserted[0].id))).toHaveLength(0);
    const mediaAfter = await db.select().from(media).where(eq(media.id, mediaRow[0].id));
    expect(mediaAfter[0].postId).toBeNull();
  });

  it('POST /api/posts/:id/duplicate clones as draft preserving scheduledAt + platforms', async () => {
    const source = await db.insert(posts).values({
      userId, caption: 'Original', scheduledAt: '2030-04-15T10:00:00', status: 'published',
    }).returning();
    await db.insert(postPlatforms).values({
      postId: source[0].id, platformAccountId, status: 'published', platformPostId: 'remote-1',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/posts/${source[0].id}/duplicate`,
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const clone = res.json();

    expect(clone.id).not.toBe(source[0].id);
    expect(clone.caption).toBe('Original');
    expect(clone.status).toBe('draft');
    expect(clone.scheduledAt).toBe(source[0].scheduledAt);

    const clonedLinks = await db.select().from(postPlatforms).where(eq(postPlatforms.postId, clone.id));
    expect(clonedLinks).toHaveLength(1);
    expect(clonedLinks[0].status).toBe('pending');
    expect(clonedLinks[0].platformPostId).toBeNull();
  });

  it('GET /api/posts/:id/logs returns logs for the post', async () => {
    const inserted = await db.insert(posts).values({
      userId, caption: 'Logs', scheduledAt: '2030-04-15T10:00:00', status: 'published',
    }).returning();
    await db.insert(publishLogs).values({ postId: inserted[0].id, platform: 'facebook', level: 'info', message: 'ok' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/posts/${inserted[0].id}/logs`,
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].message).toBe('ok');
  });

  it('GET /api/posts without auth returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/posts' });
    expect(res.statusCode).toBe(401);
  });
});
