/**
 * Background job: pulls the user's recent IG videos and schedules them for
 * publication on YouTube Shorts + TikTok via the existing publish pipeline.
 *
 * Intentionally backend-only. Does not modify any Meta-owned code; reads
 * the IG token already in `platform_accounts`.
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
  listRecentVideos,
  downloadAndStoreInR2,
  type IgMediaItem,
} from '../importers/instagram.js';

type Account = typeof platformAccounts.$inferSelect;

interface SyncTriple {
  userId: number;
  ig: Account;
  yt: Account;
  tiktok: Account;
}

function pickFirstByPlatform(rows: Account[]): { ig?: Account; yt?: Account; tiktok?: Account } {
  const out: { ig?: Account; yt?: Account; tiktok?: Account } = {};
  for (const r of rows) {
    if (r.platform === 'instagram' && !out.ig) out.ig = r;
    else if (r.platform === 'youtube' && !out.yt) out.yt = r;
    else if (r.platform === 'tiktok' && !out.tiktok) out.tiktok = r;
  }
  return out;
}

async function findSyncableUsers(): Promise<SyncTriple[]> {
  const allAccounts = await db.select().from(platformAccounts);
  const byUser = new Map<number, Account[]>();
  for (const acc of allAccounts) {
    const list = byUser.get(acc.userId) ?? [];
    list.push(acc);
    byUser.set(acc.userId, list);
  }

  const triples: SyncTriple[] = [];
  for (const [userId, list] of byUser) {
    const { ig, yt, tiktok } = pickFirstByPlatform(list);
    if (ig && yt && tiktok) {
      triples.push({ userId, ig, yt, tiktok });
    }
  }
  return triples;
}

async function importVideoForUser(
  triple: SyncTriple,
  video: IgMediaItem,
  scheduledAtIso: string,
): Promise<void> {
  const stored = await downloadAndStoreInR2({
    mediaUrl: video.mediaUrl,
    userId: triple.userId,
    igMediaId: video.id,
  });

  await db.transaction(async (tx) => {
    const inserted = await tx.insert(posts).values({
      userId: triple.userId,
      caption: video.caption ?? '',
      scheduledAt: scheduledAtIso,
      status: 'scheduled',
    }).returning();
    const post = inserted[0];

    await tx.insert(media).values({
      userId: triple.userId,
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

    await tx.insert(postPlatforms).values([
      { postId: post.id, platformAccountId: triple.yt.id },
      { postId: post.id, platformAccountId: triple.tiktok.id },
    ]);

    await tx.insert(instagramImports).values({
      userId: triple.userId,
      igMediaId: video.id,
      igPermalink: video.permalink ?? null,
      postId: post.id,
    });
  });
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

async function syncOneUser(triple: SyncTriple, sinceIso: string): Promise<{ imported: number; skipped: number; failed: number }> {
  const stats = { imported: 0, skipped: 0, failed: 0 };

  let videos: IgMediaItem[];
  try {
    videos = await listRecentVideos({
      igUserId: triple.ig.accountId,
      accessToken: triple.ig.accessToken,
      sinceIso,
    });
  } catch (err: any) {
    console.error(`[ig-auto-sync] user ${triple.userId}: list failed:`, err?.message || err);
    return stats;
  }

  if (videos.length === 0) return stats;

  const igIds = videos.map((v) => v.id);
  const existing = await db.select({ igMediaId: instagramImports.igMediaId })
    .from(instagramImports)
    .where(and(
      eq(instagramImports.userId, triple.userId),
      inArray(instagramImports.igMediaId, igIds),
    ));
  const imported = new Set(existing.map((r) => r.igMediaId));
  stats.skipped = videos.length - (videos.length - imported.size);

  const fresh = videos
    .filter((v) => !imported.has(v.id))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (fresh.length === 0) return stats;

  const minDelayMs = config.instagramAutoSync.minDelayMinutes * 60_000;
  const spacingMs = config.instagramAutoSync.spacingHours * 3_600_000;
  const now = Date.now();

  const latestRow = await db.select({ scheduledAt: posts.scheduledAt })
    .from(posts)
    .where(eq(posts.userId, triple.userId))
    .orderBy(desc(posts.scheduledAt))
    .limit(1);
  const lastTs = latestRow[0]?.scheduledAt
    ? parseStoredTimestampAsUtc(latestRow[0].scheduledAt)
    : 0;

  let slot = Math.max(now + minDelayMs, lastTs + spacingMs);

  for (const video of fresh) {
    try {
      await importVideoForUser(triple, video, new Date(slot).toISOString());
      stats.imported++;
      slot += spacingMs;
    } catch (err: any) {
      stats.failed++;
      console.error(`[ig-auto-sync] user ${triple.userId}: import of IG ${video.id} failed:`, err?.message || err);
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
  const sinceIso = new Date(
    Date.now() - config.instagramAutoSync.lookbackHours * 3_600_000,
  ).toISOString();

  const triples = await findSyncableUsers();
  if (triples.length === 0) {
    console.log('[ig-auto-sync] no users with IG+YT+TikTok connected — skipping');
    return;
  }

  let totalImported = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const triple of triples) {
    const s = await syncOneUser(triple, sinceIso);
    totalImported += s.imported;
    totalSkipped += s.skipped;
    totalFailed += s.failed;
  }

  console.log(
    `[ig-auto-sync] done: ${triples.length} user(s) processed — imported=${totalImported} skipped=${totalSkipped} failed=${totalFailed}`,
  );
}
