import { db } from '../db/index.js';
import { media, posts } from '../db/schema.js';
import { eq, and, lt, isNull, inArray } from 'drizzle-orm';
import { deleteFromR2 } from './storage.js';

async function deleteMediaRowsAndObjects(postIds: number[]): Promise<number> {
  if (postIds.length === 0) return 0;

  const rows = await db.select().from(media).where(inArray(media.postId, postIds));
  for (const row of rows) {
    try { await deleteFromR2(row.originalKey); } catch (err) { console.warn(`R2 delete ${row.originalKey} failed:`, err); }
    if (row.watermarkedKey) {
      try { await deleteFromR2(row.watermarkedKey); } catch (err) { console.warn(`R2 delete ${row.watermarkedKey} failed:`, err); }
    }
  }
  if (rows.length > 0) {
    await db.delete(media).where(inArray(media.postId, postIds));
  }
  return rows.length;
}

export async function cleanupMediaForPost(postId: number): Promise<void> {
  await deleteMediaRowsAndObjects([postId]);
}

export async function cleanupOrphanedMedia(): Promise<{ removed: number }> {
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const failedOrPartial = await db.select({ id: posts.id }).from(posts)
    .where(and(inArray(posts.status, ['failed', 'partial']), lt(posts.updatedAt, sevenDaysAgo)));

  const oldDrafts = await db.select({ id: posts.id }).from(posts)
    .where(and(eq(posts.status, 'draft'), lt(posts.updatedAt, thirtyDaysAgo)));

  const reapablePostIds = [...failedOrPartial, ...oldDrafts].map(p => p.id);

  let removed = await deleteMediaRowsAndObjects(reapablePostIds);

  const orphans = await db.select().from(media)
    .where(and(isNull(media.postId), lt(media.createdAt, thirtyDaysAgo)));

  for (const row of orphans) {
    try { await deleteFromR2(row.originalKey); } catch {}
    if (row.watermarkedKey) {
      try { await deleteFromR2(row.watermarkedKey); } catch {}
    }
  }
  if (orphans.length > 0) {
    await db.delete(media).where(inArray(media.id, orphans.map(o => o.id)));
    removed += orphans.length;
  }

  return { removed };
}
