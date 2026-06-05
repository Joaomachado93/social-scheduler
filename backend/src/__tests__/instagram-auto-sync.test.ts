import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Force the username so the orchestrator runs end-to-end (the env-driven
// config block reads process.env at config-module-load time, but we can
// re-stub the imported `config` object before each test if needed).
vi.mock('../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config.js')>();
  return {
    ...actual,
    config: {
      ...actual.config,
      instagramAutoSync: {
        ...actual.config.instagramAutoSync,
        username: 'testuser',
        // Force test defaults regardless of local .env
        lookbackHours: 48,
        spacingHours: 24,
        minDelayMinutes: 60,
      },
    },
  };
});

// Mock the importer module so the orchestrator test never hits the network.
vi.mock('../services/importers/instagram.js', () => ({
  listRecentVideosByUsername: vi.fn(),
  downloadAndStoreInR2: vi.fn(),
}));

import { setupTestDb, teardownTestDb } from './setup.js';
import bcrypt from 'bcrypt';
import { users, platformAccounts, posts, postPlatforms, media, instagramImports } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { runInstagramAutoSync } from '../services/jobs/instagramAutoSync.js';
import {
  listRecentVideosByUsername,
  downloadAndStoreInR2,
} from '../services/importers/instagram.js';

const mockListByUsername = vi.mocked(listRecentVideosByUsername);
const mockDownloadAndStoreInR2 = vi.mocked(downloadAndStoreInR2);

async function makeUser(db: any, email: string) {
  const hash = bcrypt.hashSync('x', 10);
  const u = await db.insert(users).values({ email, passwordHash: hash }).returning();
  return u[0].id as number;
}

async function attach(db: any, userId: number, platform: 'youtube' | 'tiktok', accountId: string) {
  const r = await db.insert(platformAccounts).values({
    userId,
    platform,
    accountName: `${platform}-${accountId}`,
    accountId,
    accessToken: `tok-${platform}-${accountId}`,
    refreshToken: `rt-${platform}`,
  }).returning();
  return r[0].id as number;
}

function tsMs(stored: string): number {
  const hasTz = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(stored);
  if (hasTz) return new Date(stored).getTime();
  const isoish = stored.includes('T') ? stored : stored.replace(' ', 'T');
  return new Date(isoish + 'Z').getTime();
}

describe('runInstagramAutoSync (scrape mode)', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it('skips users missing YT or TikTok', async () => {
    const db = (await import('../db/index.js')).db;
    const u = await makeUser(db, 'a@t.com');
    await attach(db, u, 'youtube', 'yt-1');
    // No TikTok — skip user; scraper still called (returns nothing to import).
    mockListByUsername.mockResolvedValue([]);

    await runInstagramAutoSync();

    expect(mockDownloadAndStoreInR2).not.toHaveBeenCalled();
    const postsRows = await db.select().from(posts);
    expect(postsRows.length).toBe(0);
  });

  it('no-op when no user has YT+TikTok (does not even scrape)', async () => {
    const db = (await import('../db/index.js')).db;
    const u = await makeUser(db, 'a@t.com');
    await attach(db, u, 'youtube', 'yt-1');
    // No TikTok — no syncable user, scraper should not be called.

    await runInstagramAutoSync();

    expect(mockListByUsername).not.toHaveBeenCalled();
  });

  it('imports new IG videos and schedules YT+TikTok publish legs', async () => {
    const db = (await import('../db/index.js')).db;
    const userId = await makeUser(db, 'a@t.com');
    const ytId = await attach(db, userId, 'youtube', 'yt-1');
    const ttId = await attach(db, userId, 'tiktok', 'tt-1');

    mockListByUsername.mockResolvedValue([
      { id: 'IGM1', mediaType: 'REELS', mediaUrl: 'https://ig/v1.mp4', timestamp: new Date(Date.now() - 3600_000).toISOString(), caption: 'hello\n#yo' },
    ]);
    mockDownloadAndStoreInR2.mockResolvedValue({ key: 'users/1/instagram/IGM1-x.mp4', size: 1234, mimeType: 'video/mp4' });

    await runInstagramAutoSync();

    expect(mockListByUsername).toHaveBeenCalledWith(expect.objectContaining({ username: 'testuser' }));

    const postsRows = await db.select().from(posts);
    expect(postsRows.length).toBe(1);
    expect(postsRows[0].caption).toBe('hello\n#yo');
    expect(postsRows[0].status).toBe('scheduled');

    const legs = await db.select().from(postPlatforms).where(eq(postPlatforms.postId, postsRows[0].id));
    expect(legs.length).toBe(2);
    expect(legs.map((l: any) => l.platformAccountId).sort()).toEqual([ytId, ttId].sort());

    const mediaRows = await db.select().from(media).where(eq(media.postId, postsRows[0].id));
    expect(mediaRows.length).toBe(1);
    expect(mediaRows[0].processingStatus).toBe('done');

    const imports = await db.select().from(instagramImports);
    expect(imports.length).toBe(1);
    expect(imports[0].igMediaId).toBe('IGM1');
  });

  it('skips videos already in instagram_imports', async () => {
    const db = (await import('../db/index.js')).db;
    const userId = await makeUser(db, 'a@t.com');
    await attach(db, userId, 'youtube', 'yt-1');
    await attach(db, userId, 'tiktok', 'tt-1');

    const seededPost = await db.insert(posts).values({
      userId, caption: 'old', scheduledAt: new Date(Date.now() + 7200_000).toISOString(), status: 'scheduled',
    }).returning();
    await db.insert(instagramImports).values({
      userId, igMediaId: 'IGM_OLD', postId: seededPost[0].id,
    });

    mockListByUsername.mockResolvedValue([
      { id: 'IGM_OLD', mediaType: 'REELS', mediaUrl: 'https://ig/old.mp4', timestamp: new Date().toISOString() },
      { id: 'IGM_NEW', mediaType: 'REELS', mediaUrl: 'https://ig/new.mp4', timestamp: new Date().toISOString() },
    ]);
    mockDownloadAndStoreInR2.mockResolvedValue({ key: 'k', size: 1, mimeType: 'video/mp4' });

    await runInstagramAutoSync();

    expect(mockDownloadAndStoreInR2).toHaveBeenCalledTimes(1);
    const imports = await db.select().from(instagramImports);
    expect(imports.length).toBe(2);
    expect(new Set(imports.map((i: any) => i.igMediaId))).toEqual(new Set(['IGM_OLD', 'IGM_NEW']));
  });

  it('spaces multiple new videos 24h apart, oldest first', async () => {
    const db = (await import('../db/index.js')).db;
    const userId = await makeUser(db, 'a@t.com');
    await attach(db, userId, 'youtube', 'yt-1');
    await attach(db, userId, 'tiktok', 'tt-1');

    const t1 = new Date('2026-01-01T00:00:00Z').toISOString();
    const t2 = new Date('2026-01-01T06:00:00Z').toISOString();
    const t3 = new Date('2026-01-01T12:00:00Z').toISOString();

    mockListByUsername.mockResolvedValue([
      { id: 'C', mediaType: 'REELS', mediaUrl: 'https://ig/c.mp4', timestamp: t3 },
      { id: 'A', mediaType: 'REELS', mediaUrl: 'https://ig/a.mp4', timestamp: t1 },
      { id: 'B', mediaType: 'REELS', mediaUrl: 'https://ig/b.mp4', timestamp: t2 },
    ]);
    let n = 0;
    mockDownloadAndStoreInR2.mockImplementation(async () => ({ key: `k${++n}`, size: 1, mimeType: 'video/mp4' }));

    const start = Date.now();
    await runInstagramAutoSync();

    const postsRows = await db.select().from(posts).orderBy(posts.id);
    expect(postsRows.length).toBe(3);

    const t0 = tsMs(postsRows[0].scheduledAt);
    const t1ms = tsMs(postsRows[1].scheduledAt);
    const t2ms = tsMs(postsRows[2].scheduledAt);

    expect(t0).toBeGreaterThanOrEqual(start + 60 * 60_000 - 1000);
    expect(t1ms - t0).toBe(24 * 3_600_000);
    expect(t2ms - t1ms).toBe(24 * 3_600_000);
  });

  it('honors existing scheduled posts when picking the first slot', async () => {
    const db = (await import('../db/index.js')).db;
    const userId = await makeUser(db, 'a@t.com');
    await attach(db, userId, 'youtube', 'yt-1');
    await attach(db, userId, 'tiktok', 'tt-1');

    const futureMs = Date.now() + 5 * 3_600_000;
    await db.insert(posts).values({
      userId, caption: 'existing', scheduledAt: new Date(futureMs).toISOString(), status: 'scheduled',
    });

    mockListByUsername.mockResolvedValue([
      { id: 'IGM_NEW', mediaType: 'REELS', mediaUrl: 'https://ig/n.mp4', timestamp: new Date().toISOString() },
    ]);
    mockDownloadAndStoreInR2.mockResolvedValue({ key: 'k', size: 1, mimeType: 'video/mp4' });

    await runInstagramAutoSync();

    const newPostRows = await db.select().from(posts).where(eq(posts.caption, ''));
    expect(newPostRows.length).toBe(1);
    const scheduledMs = tsMs(newPostRows[0].scheduledAt);
    expect(scheduledMs).toBeGreaterThanOrEqual(futureMs + 24 * 3_600_000 - 1000);
    expect(scheduledMs).toBeLessThanOrEqual(futureMs + 24 * 3_600_000 + 1000);
  });

  it('no-op when listRecentVideosByUsername throws (does not crash)', async () => {
    const db = (await import('../db/index.js')).db;
    const userId = await makeUser(db, 'a@t.com');
    await attach(db, userId, 'youtube', 'yt-1');
    await attach(db, userId, 'tiktok', 'tt-1');

    mockListByUsername.mockRejectedValueOnce(new Error('IG blocked the request'));

    await expect(runInstagramAutoSync()).resolves.toBeUndefined();
    expect(mockDownloadAndStoreInR2).not.toHaveBeenCalled();
  });
});
