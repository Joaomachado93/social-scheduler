import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the importer module so the orchestrator test never touches IG / R2.
vi.mock('../services/importers/instagram.js', () => ({
  listRecentVideos: vi.fn(),
  downloadAndStoreInR2: vi.fn(),
}));

import { setupTestDb, teardownTestDb } from './setup.js';
import bcrypt from 'bcrypt';
import { users, platformAccounts, posts, postPlatforms, media, instagramImports } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { runInstagramAutoSync } from '../services/jobs/instagramAutoSync.js';
import {
  listRecentVideos,
  downloadAndStoreInR2,
} from '../services/importers/instagram.js';

const mockListRecentVideos = vi.mocked(listRecentVideos);
const mockDownloadAndStoreInR2 = vi.mocked(downloadAndStoreInR2);

async function makeUser(db: any, email: string) {
  const hash = bcrypt.hashSync('x', 10);
  const u = await db.insert(users).values({ email, passwordHash: hash }).returning();
  return u[0].id as number;
}

/**
 * Mirror of the orchestrator's UTC parser — `scheduledAt` is stored as
 * `timestamp without time zone` so pglite returns the value without a Z,
 * which `new Date()` would treat as local time. Force UTC interpretation.
 */
function tsMs(stored: string): number {
  const hasTz = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(stored);
  if (hasTz) return new Date(stored).getTime();
  const isoish = stored.includes('T') ? stored : stored.replace(' ', 'T');
  return new Date(isoish + 'Z').getTime();
}

async function attach(db: any, userId: number, platform: 'instagram' | 'youtube' | 'tiktok', accountId: string) {
  const r = await db.insert(platformAccounts).values({
    userId,
    platform,
    accountName: `${platform}-${accountId}`,
    accountId,
    accessToken: `tok-${platform}-${accountId}`,
    refreshToken: platform === 'instagram' ? null : `rt-${platform}`,
  }).returning();
  return r[0].id as number;
}

describe('runInstagramAutoSync', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it('skips users missing any of IG / YT / TikTok', async () => {
    const db = (await import('../db/index.js')).db;
    const u = await makeUser(db, 'a@t.com');
    await attach(db, u, 'instagram', 'ig-1');
    await attach(db, u, 'youtube', 'yt-1');
    // No TikTok → skip

    mockListRecentVideos.mockResolvedValue([{
      id: 'IGM1', mediaType: 'VIDEO', mediaUrl: 'https://ig/v.mp4', timestamp: new Date().toISOString(),
    }]);

    await runInstagramAutoSync();

    expect(mockListRecentVideos).not.toHaveBeenCalled();
    expect(mockDownloadAndStoreInR2).not.toHaveBeenCalled();

    const postsRows = await db.select().from(posts);
    expect(postsRows.length).toBe(0);
  });

  it('imports new IG videos and schedules YT+TikTok publish legs', async () => {
    const db = (await import('../db/index.js')).db;
    const userId = await makeUser(db, 'a@t.com');
    await attach(db, userId, 'instagram', 'ig-1');
    const ytId = await attach(db, userId, 'youtube', 'yt-1');
    const ttId = await attach(db, userId, 'tiktok', 'tt-1');

    mockListRecentVideos.mockResolvedValue([
      { id: 'IGM1', mediaType: 'VIDEO', mediaUrl: 'https://ig/v1.mp4', timestamp: new Date(Date.now() - 3600_000).toISOString(), caption: 'hello\n#yo' },
    ]);
    mockDownloadAndStoreInR2.mockResolvedValue({ key: 'users/1/instagram/IGM1-x.mp4', size: 1234, mimeType: 'video/mp4' });

    await runInstagramAutoSync();

    const postsRows = await db.select().from(posts);
    expect(postsRows.length).toBe(1);
    expect(postsRows[0].caption).toBe('hello\n#yo');
    expect(postsRows[0].status).toBe('scheduled');
    expect(postsRows[0].userId).toBe(userId);

    const legs = await db.select().from(postPlatforms).where(eq(postPlatforms.postId, postsRows[0].id));
    expect(legs.length).toBe(2);
    const platformIds = legs.map((l: any) => l.platformAccountId).sort();
    expect(platformIds).toEqual([ytId, ttId].sort());

    const mediaRows = await db.select().from(media).where(eq(media.postId, postsRows[0].id));
    expect(mediaRows.length).toBe(1);
    expect(mediaRows[0].mediaType).toBe('video');
    expect(mediaRows[0].processingStatus).toBe('done');

    const imports = await db.select().from(instagramImports);
    expect(imports.length).toBe(1);
    expect(imports[0].igMediaId).toBe('IGM1');
    expect(imports[0].postId).toBe(postsRows[0].id);
  });

  it('skips videos already in instagram_imports', async () => {
    const db = (await import('../db/index.js')).db;
    const userId = await makeUser(db, 'a@t.com');
    await attach(db, userId, 'instagram', 'ig-1');
    await attach(db, userId, 'youtube', 'yt-1');
    await attach(db, userId, 'tiktok', 'tt-1');

    // Seed an existing post + import
    const seededPost = await db.insert(posts).values({
      userId, caption: 'old', scheduledAt: new Date(Date.now() + 7200_000).toISOString(), status: 'scheduled',
    }).returning();
    await db.insert(instagramImports).values({
      userId, igMediaId: 'IGM_OLD', postId: seededPost[0].id,
    });

    mockListRecentVideos.mockResolvedValue([
      { id: 'IGM_OLD', mediaType: 'VIDEO', mediaUrl: 'https://ig/old.mp4', timestamp: new Date().toISOString() },
      { id: 'IGM_NEW', mediaType: 'REELS', mediaUrl: 'https://ig/new.mp4', timestamp: new Date().toISOString() },
    ]);
    mockDownloadAndStoreInR2.mockResolvedValue({ key: 'users/1/instagram/IGM_NEW-y.mp4', size: 999, mimeType: 'video/mp4' });

    await runInstagramAutoSync();

    expect(mockDownloadAndStoreInR2).toHaveBeenCalledTimes(1);
    const imports = await db.select().from(instagramImports);
    expect(imports.length).toBe(2);
    expect(new Set(imports.map((i: any) => i.igMediaId))).toEqual(new Set(['IGM_OLD', 'IGM_NEW']));
  });

  it('spaces multiple new videos 24h apart, oldest first', async () => {
    const db = (await import('../db/index.js')).db;
    const userId = await makeUser(db, 'a@t.com');
    await attach(db, userId, 'instagram', 'ig-1');
    await attach(db, userId, 'youtube', 'yt-1');
    await attach(db, userId, 'tiktok', 'tt-1');

    const t1 = new Date('2026-01-01T00:00:00Z').toISOString(); // oldest
    const t2 = new Date('2026-01-01T06:00:00Z').toISOString();
    const t3 = new Date('2026-01-01T12:00:00Z').toISOString(); // newest

    mockListRecentVideos.mockResolvedValue([
      { id: 'C', mediaType: 'VIDEO', mediaUrl: 'https://ig/c.mp4', timestamp: t3 },
      { id: 'A', mediaType: 'VIDEO', mediaUrl: 'https://ig/a.mp4', timestamp: t1 },
      { id: 'B', mediaType: 'VIDEO', mediaUrl: 'https://ig/b.mp4', timestamp: t2 },
    ]);
    let n = 0;
    mockDownloadAndStoreInR2.mockImplementation(async () => ({
      key: `k${++n}`, size: 1, mimeType: 'video/mp4',
    }));

    const start = Date.now();
    await runInstagramAutoSync();

    const imports = await db.select().from(instagramImports).orderBy(instagramImports.id);
    const importPostIds = imports.map((i: any) => i.postId);
    const postsRows = await db.select().from(posts).orderBy(posts.id);

    // Posts created in the order: A, B, C (oldest IG timestamp first)
    expect(postsRows.map((p: any) => p.id)).toEqual(importPostIds);
    expect(imports.map((i: any) => i.igMediaId)).toEqual(['A', 'B', 'C']);

    const t0 = tsMs(postsRows[0].scheduledAt);
    const t1ms = tsMs(postsRows[1].scheduledAt);
    const t2ms = tsMs(postsRows[2].scheduledAt);

    expect(t0).toBeGreaterThanOrEqual(start + 60 * 60_000 - 1000); // >= now + 60 min (allow 1s slack)
    expect(t1ms - t0).toBe(24 * 3_600_000);
    expect(t2ms - t1ms).toBe(24 * 3_600_000);
  });

  it('honors existing scheduled posts when picking the first slot', async () => {
    const db = (await import('../db/index.js')).db;
    const userId = await makeUser(db, 'a@t.com');
    await attach(db, userId, 'instagram', 'ig-1');
    await attach(db, userId, 'youtube', 'yt-1');
    await attach(db, userId, 'tiktok', 'tt-1');

    // A post already scheduled 5h from now → next IG import must land 5h + 24h = 29h from now
    const futureMs = Date.now() + 5 * 3_600_000;
    await db.insert(posts).values({
      userId, caption: 'existing', scheduledAt: new Date(futureMs).toISOString(), status: 'scheduled',
    });

    mockListRecentVideos.mockResolvedValue([
      { id: 'IGM_NEW', mediaType: 'VIDEO', mediaUrl: 'https://ig/n.mp4', timestamp: new Date().toISOString() },
    ]);
    mockDownloadAndStoreInR2.mockResolvedValue({ key: 'k', size: 1, mimeType: 'video/mp4' });

    await runInstagramAutoSync();

    const newPostRows = await db.select().from(posts).where(eq(posts.caption, ''));
    expect(newPostRows.length).toBe(1);
    const scheduledMs = tsMs(newPostRows[0].scheduledAt);
    expect(scheduledMs).toBeGreaterThanOrEqual(futureMs + 24 * 3_600_000 - 1000);
    expect(scheduledMs).toBeLessThanOrEqual(futureMs + 24 * 3_600_000 + 1000);
  });

  it('no-op when listRecentVideos throws (skips user, does not crash)', async () => {
    const db = (await import('../db/index.js')).db;
    const userId = await makeUser(db, 'a@t.com');
    await attach(db, userId, 'instagram', 'ig-1');
    await attach(db, userId, 'youtube', 'yt-1');
    await attach(db, userId, 'tiktok', 'tt-1');

    mockListRecentVideos.mockRejectedValueOnce(new Error('IG token expired'));

    await expect(runInstagramAutoSync()).resolves.toBeUndefined();
    expect(mockDownloadAndStoreInR2).not.toHaveBeenCalled();
  });
});
