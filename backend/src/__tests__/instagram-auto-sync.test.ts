import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mutable config block shared across describe groups so individual `describe`
// blocks can re-mock with their own window/spacing values without restarting
// the test runner. Default: window disabled (00h-23h) so existing spacing
// tests keep working; the window-specific `describe` block re-stubs.
const igAutoSyncMock = {
  enabled: true,
  username: 'testuser',
  cron: '0 3 * * *',
  timezone: 'UTC',
  lookbackHours: 48,
  spacingHours: 24,
  minDelayMinutes: 60,
  windowStartHour: 0,
  windowEndHour: 23,
};

vi.mock('../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config.js')>();
  return {
    ...actual,
    get config() {
      return {
        ...actual.config,
        instagramAutoSync: { ...actual.config.instagramAutoSync, ...igAutoSyncMock },
      };
    },
  };
});

vi.mock('../services/importers/instagram.js', () => ({
  listRecentVideosByUsername: vi.fn(),
  downloadAndStoreInR2: vi.fn(),
}));

// Stub the YT native scheduler so tests don't hit the Google API. The
// existing tests assert only on DB rows (posts/media/postPlatforms),
// the YT call itself is covered by youtubeNativeSchedule.test.ts (TODO).
vi.mock('../services/publishers/youtubeNativeSchedule.js', () => ({
  scheduleYouTubeNative: vi.fn().mockResolvedValue('yt-stub-id'),
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

function hourInTz(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour: '2-digit', hour12: false,
  }).formatToParts(new Date(ms));
  const h = parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
  return h === 24 ? 0 : h;
}

describe('runInstagramAutoSync — orchestration', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    Object.assign(igAutoSyncMock, {
      enabled: true,
      username: 'testuser',
      timezone: 'UTC',
      lookbackHours: 48,
      spacingHours: 24,
      minDelayMinutes: 60,
      windowStartHour: 0,
      windowEndHour: 23,
    });
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it('skips users missing YT or TikTok', async () => {
    const db = (await import('../db/index.js')).db;
    const u = await makeUser(db, 'a@t.com');
    await attach(db, u, 'youtube', 'yt-1');
    mockListByUsername.mockResolvedValue([]);

    await runInstagramAutoSync();
    expect(mockDownloadAndStoreInR2).not.toHaveBeenCalled();
    const postsRows = await db.select().from(posts);
    expect(postsRows.length).toBe(0);
  });

  it('no-op when no user has YT+TikTok (does not scrape)', async () => {
    const db = (await import('../db/index.js')).db;
    const u = await makeUser(db, 'a@t.com');
    await attach(db, u, 'youtube', 'yt-1');

    await runInstagramAutoSync();
    expect(mockListByUsername).not.toHaveBeenCalled();
  });

  it('no-op when IG_USERNAME is empty', async () => {
    igAutoSyncMock.username = '';
    const db = (await import('../db/index.js')).db;
    const userId = await makeUser(db, 'a@t.com');
    await attach(db, userId, 'youtube', 'yt-1');
    await attach(db, userId, 'tiktok', 'tt-1');

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
    mockDownloadAndStoreInR2.mockResolvedValue({ key: 'k', size: 1234, mimeType: 'video/mp4' });

    await runInstagramAutoSync();

    const postsRows = await db.select().from(posts);
    expect(postsRows.length).toBe(1);
    expect(postsRows[0].caption).toBe('hello\n#yo');

    const legs = await db.select().from(postPlatforms).where(eq(postPlatforms.postId, postsRows[0].id));
    expect(legs.map((l: any) => l.platformAccountId).sort()).toEqual([ytId, ttId].sort());

    const mediaRows = await db.select().from(media).where(eq(media.postId, postsRows[0].id));
    expect(mediaRows[0].processingStatus).toBe('done');

    const imports = await db.select().from(instagramImports);
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

describe('runInstagramAutoSync — spacing (window disabled)', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    Object.assign(igAutoSyncMock, {
      enabled: true,
      username: 'testuser',
      timezone: 'UTC',
      lookbackHours: 48,
      spacingHours: 24,
      minDelayMinutes: 60,
      windowStartHour: 0,  // disable window
      windowEndHour: 23,
    });
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it('spaces multiple new videos 24h apart, oldest first', async () => {
    const db = (await import('../db/index.js')).db;
    const userId = await makeUser(db, 'a@t.com');
    await attach(db, userId, 'youtube', 'yt-1');
    await attach(db, userId, 'tiktok', 'tt-1');

    mockListByUsername.mockResolvedValue([
      { id: 'C', mediaType: 'REELS', mediaUrl: 'https://ig/c.mp4', timestamp: '2026-01-01T12:00:00Z' },
      { id: 'A', mediaType: 'REELS', mediaUrl: 'https://ig/a.mp4', timestamp: '2026-01-01T00:00:00Z' },
      { id: 'B', mediaType: 'REELS', mediaUrl: 'https://ig/b.mp4', timestamp: '2026-01-01T06:00:00Z' },
    ]);
    let n = 0;
    mockDownloadAndStoreInR2.mockImplementation(async () => ({ key: `k${++n}`, size: 1, mimeType: 'video/mp4' }));

    await runInstagramAutoSync();

    const postsRows = await db.select().from(posts).orderBy(posts.id);
    const t0 = tsMs(postsRows[0].scheduledAt);
    const t1 = tsMs(postsRows[1].scheduledAt);
    const t2 = tsMs(postsRows[2].scheduledAt);

    expect(t1 - t0).toBe(24 * 3_600_000);
    expect(t2 - t1).toBe(24 * 3_600_000);
  });
});

describe('runInstagramAutoSync — publishing window', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    Object.assign(igAutoSyncMock, {
      enabled: true,
      username: 'testuser',
      timezone: 'UTC',
      lookbackHours: 48,
      spacingHours: 2,
      minDelayMinutes: 60,
      windowStartHour: 8,
      windowEndHour: 22,
    });
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it('clips an early-morning candidate to windowStartHour same day', async () => {
    const db = (await import('../db/index.js')).db;
    const userId = await makeUser(db, 'a@t.com');
    await attach(db, userId, 'youtube', 'yt-1');
    await attach(db, userId, 'tiktok', 'tt-1');

    // Seed a post in the past so first candidate slot is `now + minDelay`
    // (in UTC, the test runner is at "now"). With windowStart=8 UTC, anything
    // before 8h gets pushed forward to 8:00 UTC same day.
    mockListByUsername.mockResolvedValue([
      { id: 'X', mediaType: 'REELS', mediaUrl: 'https://ig/x.mp4', timestamp: new Date().toISOString() },
    ]);
    mockDownloadAndStoreInR2.mockResolvedValue({ key: 'k', size: 1, mimeType: 'video/mp4' });

    await runInstagramAutoSync();

    const [row] = await db.select().from(posts);
    const scheduledMs = tsMs(row.scheduledAt);
    const h = hourInTz(scheduledMs, 'UTC');
    expect(h).toBeGreaterThanOrEqual(8);
    expect(h).toBeLessThanOrEqual(22);
  });

  it('jumps to next-day windowStart when 8 slots fill the daily window', async () => {
    const db = (await import('../db/index.js')).db;
    const userId = await makeUser(db, 'a@t.com');
    await attach(db, userId, 'youtube', 'yt-1');
    await attach(db, userId, 'tiktok', 'tt-1');

    // Window 08-22, spacing 2h → 8 slots/day: 8,10,12,14,16,18,20,22.
    // Generate 10 videos → 8 should land day 1, 2 should land day 2 at 8 and 10.
    mockListByUsername.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        id: `V${i}`,
        mediaType: 'REELS' as const,
        mediaUrl: `https://ig/v${i}.mp4`,
        timestamp: new Date(2026, 0, 1, i).toISOString(),
      })),
    );
    let n = 0;
    mockDownloadAndStoreInR2.mockImplementation(async () => ({ key: `k${++n}`, size: 1, mimeType: 'video/mp4' }));

    await runInstagramAutoSync();

    const postsRows = await db.select().from(posts).orderBy(posts.id);
    expect(postsRows.length).toBe(10);

    const hours = postsRows.map((r: any) => hourInTz(tsMs(r.scheduledAt), 'UTC'));
    const days = postsRows.map((r: any) => {
      const ms = tsMs(r.scheduledAt);
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', day: '2-digit' }).format(new Date(ms));
    });

    // Every slot is in the window
    for (const h of hours) {
      expect(h).toBeGreaterThanOrEqual(8);
      expect(h).toBeLessThanOrEqual(22);
    }

    // Two distinct days
    const uniqueDays = new Set(days);
    expect(uniqueDays.size).toBe(2);

    // 8 slots on the first day, 2 on the second
    const firstDay = days[0];
    expect(days.filter((d: any) => d === firstDay).length).toBe(8);
  });
});
