import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, teardownTestDb, getAuthToken } from './setup.js';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { users, platformAccounts } from '../db/schema.js';

describe('Video routes', () => {
  let app: FastifyInstance;
  let token: string;
  let userId: number;

  beforeEach(async () => {
    process.env.TIKTOK_CLIENT_KEY = 'CK_TEST';
    process.env.TIKTOK_CLIENT_SECRET = 'CS_TEST';
    process.env.TIKTOK_REDIRECT_URI = 'http://localhost:3001/api/video/tiktok/callback';

    const db = await setupTestDb();
    const u = await db.insert(users).values({
      email: 'v@t.com', passwordHash: bcrypt.hashSync('x', 10),
    }).returning();
    userId = u[0].id;
    token = getAuthToken(userId, 'v@t.com');

    // Seed one FB account that must NOT appear in /api/video/platforms
    await db.insert(platformAccounts).values({
      userId, platform: 'facebook', accountId: 'fb1', accessToken: 't',
    });
    // And one YouTube account that SHOULD appear
    await db.insert(platformAccounts).values({
      userId, platform: 'youtube', accountId: 'yt1', accessToken: 't',
    });

    app = await buildApp();
  });

  afterEach(async () => { await app.close(); await teardownTestDb(); });

  it('GET /api/video/platforms returns only youtube + tiktok accounts (no FB/IG)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/video/platforms',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].platform).toBe('youtube');
  });

  it('GET /api/video/tiktok/auth-url returns an authorize URL when configured', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/video/tiktok/auth-url',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.url).toContain('https://www.tiktok.com/v2/auth/authorize/');
    expect(body.url).toContain('client_key=CK_TEST');
  });
});
