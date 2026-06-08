/**
 * Background job: scrapes the public Instagram profile defined by
 * `IG_USERNAME` and schedules each new video for publication on
 * YouTube Shorts + TikTok.
 *
 * Single-tenant: one IG profile per deployment. For each user that has
 * BOTH YouTube and TikTok connected via OAuth, we import videos from
 * the same IG_USERNAME. No IG OAuth required.
 */
import { db } from '../../db/index.js';
import {
  platformAccounts,
  posts,
  media,
  postPlatforms,
  instagramImports,
} from '../../db/schema.js';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { config } from '../../config.js';
import {
  listRecentVideosByUsername,
  downloadAndStoreInR2,
  type IgMediaItem,
} from '../importers/instagram.js';
import { scheduleYouTubeNative } from '../publishers/youtubeNativeSchedule.js';
import { getPublicUrl } from '../storage.js';

type Account = typeof platformAccounts.$inferSelect;

interface SyncTarget {
  userId: number;
  yt: Account;
  tiktok: Account;
}

function pickFirstByPlatform(rows: Account[]): { yt?: Account; tiktok?: Account } {
  const out: { yt?: Account; tiktok?: Account } = {};
  for (const r of rows) {
    if (r.platform === 'youtube' && !out.yt) out.yt = r;
    else if (r.platform === 'tiktok' && !out.tiktok) out.tiktok = r;
  }
  return out;
}

async function findSyncableUsers(): Promise<SyncTarget[]> {
  const allAccounts = await db.select().from(platformAccounts);
  const byUser = new Map<number, Account[]>();
  for (const acc of allAccounts) {
    const list = byUser.get(acc.userId) ?? [];
    list.push(acc);
    byUser.set(acc.userId, list);
  }

  const targets: SyncTarget[] = [];
  for (const [userId, list] of byUser) {
    const { yt, tiktok } = pickFirstByPlatform(list);
    if (yt && tiktok) {
      targets.push({ userId, yt, tiktok });
    }
  }
  return targets;
}

/**
 * The `scheduledAt` column is `timestamp without time zone` (mode: 'string').
 * Insertion goes through `.toISOString()` (UTC + Z), but pglite/postgres can
 * return the value without the trailing Z, which `new Date()` then treats
 * as local. Force UTC interpretation by adding Z back when missing.
 */
function parseStoredTimestampAsUtc(s: string): number {
  const hasTz = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(s);
  if (hasTz) return new Date(s).getTime();
  const isoish = s.includes('T') ? s : s.replace(' ', 'T');
  return new Date(isoish + 'Z').getTime();
}

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Extract the wall-clock parts of a UTC instant in a given IANA timezone. */
function utcMsToLocalParts(utcMs: number, tz: string): LocalParts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(utcMs));
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)!.value, 10);
  let hour = get('hour');
  if (hour === 24) hour = 0; // Intl can emit 24 for midnight
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Convert wall-clock parts back to a UTC ms instant in a given timezone. */
function localPartsToUtcMs(parts: LocalParts, tz: string): number {
  const wantedUtcEquivalent = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let guess = wantedUtcEquivalent;
  // Iterate to converge; one step usually suffices, two handles DST switches.
  for (let i = 0; i < 3; i++) {
    const local = utcMsToLocalParts(guess, tz);
    const localAsUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    const offset = wantedUtcEquivalent - localAsUtc;
    if (offset === 0) return guess;
    guess += offset;
  }
  return guess;
}

/**
 * Clip a candidate slot to the daily publishing window in the configured
 * timezone. If candidate is before windowStartHour, push forward to that
 * hour same day. If after windowEndHour, push to windowStartHour next day.
 * Hours are inclusive on both ends: 22:00 is a valid slot when
 * windowEndHour=22, but 22:01 is not.
 */
function clipSlotToWindow(
  candidateMs: number,
  windowStartHour: number,
  windowEndHour: number,
  tz: string,
): number {
  const parts = utcMsToLocalParts(candidateMs, tz);
  const slotMinutes = parts.hour * 60 + parts.minute;
  const startMinutes = windowStartHour * 60;
  const endMinutes = windowEndHour * 60;

  if (slotMinutes < startMinutes) {
    return localPartsToUtcMs(
      { ...parts, hour: windowStartHour, minute: 0, second: 0 },
      tz,
    );
  }
  if (slotMinutes > endMinutes) {
    // Push to windowStart of the NEXT calendar day in tz.
    const tomorrowUtcMidnight =
      Date.UTC(parts.year, parts.month - 1, parts.day) + 24 * 3_600_000;
    const t = new Date(tomorrowUtcMidnight);
    return localPartsToUtcMs(
      {
        year: t.getUTCFullYear(),
        month: t.getUTCMonth() + 1,
        day: t.getUTCDate(),
        hour: windowStartHour,
        minute: 0,
        second: 0,
      },
      tz,
    );
  }
  return candidateMs;
}

async function importVideoForUser(
  target: SyncTarget,
  video: IgMediaItem,
  scheduledAtIso: string,
): Promise<void> {
  const stored = await downloadAndStoreInR2({
    mediaUrl: video.mediaUrl,
    userId: target.userId,
    igMediaId: video.id,
  });

  const { postId, ytLegId } = await db.transaction(async (tx) => {
    const inserted = await tx.insert(posts).values({
      userId: target.userId,
      caption: video.caption ?? '',
      scheduledAt: scheduledAtIso,
      status: 'scheduled',
    }).returning();
    const post = inserted[0];

    await tx.insert(media).values({
      userId: target.userId,
      postId: post.id,
      originalKey: stored.key,
      mediaType: 'video',
      mimeType: stored.mimeType,
      fileSize: stored.size,
      sortOrder: 0,
      // Skip watermark for IG-sourced videos — the original is already the
      // user's branded content. Flip this if you want logo composited.
      processingStatus: 'done',
    });

    const insertedLegs = await tx.insert(postPlatforms).values([
      { postId: post.id, platformAccountId: target.yt.id },
      { postId: post.id, platformAccountId: target.tiktok.id },
    ]).returning();
    const ytLeg = insertedLegs.find((l) => l.platformAccountId === target.yt.id);

    await tx.insert(instagramImports).values({
      userId: target.userId,
      igMediaId: video.id,
      igPermalink: video.permalink ?? null,
      postId: post.id,
    });

    return { postId: post.id, ytLegId: ytLeg!.id };
  });

  // Native YT scheduling: upload to YT now with publishAt = scheduledAtIso,
  // so YT handles the public-release timing and the Render dyno can sleep
  // until the next nightly sync. The TikTok leg stays `pending` and the
  // in-memory cron in scheduler.ts picks it up at scheduledAt.
  try {
    const youtubeId = await scheduleYouTubeNative({
      platformAccountId: target.yt.id,
      accessToken: target.yt.accessToken,
      refreshToken: target.yt.refreshToken,
      caption: video.caption ?? '',
      publicUrl: getPublicUrl(stored.key),
      scheduledAtIso,
      mimeType: stored.mimeType,
    });
    await db.update(postPlatforms)
      .set({ status: 'published', platformPostId: youtubeId, publishedAt: scheduledAtIso })
      .where(eq(postPlatforms.id, ytLegId));
    console.log(`[ig-auto-sync] user ${target.userId}: YT ${youtubeId} scheduled for ${scheduledAtIso} (post ${postId})`);
  } catch (err: any) {
    console.warn(`[ig-auto-sync] user ${target.userId}: native YT schedule failed for post ${postId}, leaving leg pending for cron:`, err?.message || err);
  }
}

async function syncOneUser(
  target: SyncTarget,
  videos: IgMediaItem[],
): Promise<{ imported: number; skipped: number; failed: number }> {
  const stats = { imported: 0, skipped: 0, failed: 0 };

  if (videos.length === 0) return stats;

  const igIds = videos.map((v) => v.id);
  const existing = await db.select({ igMediaId: instagramImports.igMediaId })
    .from(instagramImports)
    .where(and(
      eq(instagramImports.userId, target.userId),
      inArray(instagramImports.igMediaId, igIds),
    ));
  const imported = new Set(existing.map((r) => r.igMediaId));
  stats.skipped = imported.size;

  const fresh = videos
    .filter((v) => !imported.has(v.id))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (fresh.length === 0) return stats;

  const { minDelayMinutes, spacingHours, windowStartHour, windowEndHour, timezone } = config.instagramAutoSync;
  const minDelayMs = minDelayMinutes * 60_000;
  const spacingMs = spacingHours * 3_600_000;
  const now = Date.now();

  const latestRow = await db.select({ scheduledAt: posts.scheduledAt })
    .from(posts)
    .where(eq(posts.userId, target.userId))
    .orderBy(desc(posts.scheduledAt))
    .limit(1);
  const lastTs = latestRow[0]?.scheduledAt
    ? parseStoredTimestampAsUtc(latestRow[0].scheduledAt)
    : 0;

  // First slot: max(now+minDelay, lastTs+spacing), then clip to window.
  let slot = clipSlotToWindow(
    Math.max(now + minDelayMs, lastTs + spacingMs),
    windowStartHour,
    windowEndHour,
    timezone,
  );

  for (const video of fresh) {
    try {
      await importVideoForUser(target, video, new Date(slot).toISOString());
      stats.imported++;
      // Advance + re-clip. Clipping handles the day-boundary jump when the
      // next raw slot falls past windowEndHour.
      slot = clipSlotToWindow(slot + spacingMs, windowStartHour, windowEndHour, timezone);
    } catch (err: any) {
      stats.failed++;
      console.error(`[ig-auto-sync] user ${target.userId}: import of IG ${video.id} failed:`, err?.message || err);
    }
  }

  return stats;
}

/**
 * Entry point invoked by the cron registered in scheduler.ts.
 * The `enabled` flag is checked at cron registration — once called,
 * this function always runs end-to-end.
 */
export async function runInstagramAutoSync(): Promise<void> {
  const username = config.instagramAutoSync.username;
  if (!username) {
    console.log('[ig-auto-sync] IG_USERNAME not set — skipping');
    return;
  }

  const targets = await findSyncableUsers();
  if (targets.length === 0) {
    console.log('[ig-auto-sync] no users with YT+TikTok connected — skipping');
    return;
  }

  const sinceIso = new Date(
    Date.now() - config.instagramAutoSync.lookbackHours * 3_600_000,
  ).toISOString();

  // Scrape once per run — every user pulls from the same IG profile in
  // single-tenant deployments.
  let videos: IgMediaItem[];
  try {
    videos = await listRecentVideosByUsername({ username, sinceIso });
  } catch (err: any) {
    console.error(`[ig-auto-sync] scrape of @${username} failed:`, err?.message || err);
    return;
  }

  console.log(`[ig-auto-sync] @${username} → ${videos.length} candidate video(s) in window`);

  let totalImported = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const target of targets) {
    const s = await syncOneUser(target, videos);
    totalImported += s.imported;
    totalSkipped += s.skipped;
    totalFailed += s.failed;
  }

  console.log(
    `[ig-auto-sync] done: ${targets.length} user(s) processed — imported=${totalImported} skipped=${totalSkipped} failed=${totalFailed}`,
  );
}
