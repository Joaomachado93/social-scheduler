/**
 * Read-only Instagram importer.
 *
 * Pulls the user's own IG Business media via the Graph API using the token
 * already stored in `platform_accounts` (no changes to oauth/meta.ts or
 * publishers/instagram.ts — the Meta subsystem is frozen).
 *
 * Used by services/jobs/instagramAutoSync.ts.
 */
import axios from 'axios';
import { randomUUID } from 'crypto';
import { uploadToR2 } from '../storage.js';

const GRAPH_URL = 'https://graph.facebook.com/v19.0';

export interface IgMediaItem {
  id: string;
  mediaType: 'VIDEO' | 'REELS';
  mediaUrl: string;
  thumbnailUrl?: string;
  permalink?: string;
  caption?: string;
  timestamp: string;
}

export interface ListRecentVideosArgs {
  igUserId: string;
  accessToken: string;
  sinceIso: string;
}

/**
 * Lists VIDEO and REELS posted by the connected IG Business account since
 * `sinceIso`. Single-page only (25 default) — the auto-sync runs every few
 * hours so a single page is more than enough.
 */
export async function listRecentVideos(args: ListRecentVideosArgs): Promise<IgMediaItem[]> {
  const { igUserId, accessToken, sinceIso } = args;
  const since = new Date(sinceIso).getTime();

  const { data } = await axios.get(`${GRAPH_URL}/${igUserId}/media`, {
    params: {
      fields: 'id,media_type,media_url,thumbnail_url,permalink,caption,timestamp',
      access_token: accessToken,
    },
  });

  const items: IgMediaItem[] = (data?.data ?? [])
    .filter((m: any) => m.media_type === 'VIDEO' || m.media_type === 'REELS')
    .filter((m: any) => !!m.media_url)
    .filter((m: any) => new Date(m.timestamp).getTime() >= since)
    .map((m: any) => ({
      id: m.id,
      mediaType: m.media_type,
      mediaUrl: m.media_url,
      thumbnailUrl: m.thumbnail_url,
      permalink: m.permalink,
      caption: m.caption,
      timestamp: m.timestamp,
    }));

  return items;
}

export interface DownloadAndStoreArgs {
  mediaUrl: string;
  userId: number;
  igMediaId: string;
}

export interface DownloadAndStoreResult {
  key: string;
  size: number;
  mimeType: string;
}

/**
 * Streams an IG CDN video into R2 under a user-scoped key prefix.
 * Returns the storage key + size so the caller can insert a `media` row.
 */
export async function downloadAndStoreInR2(args: DownloadAndStoreArgs): Promise<DownloadAndStoreResult> {
  const { mediaUrl, userId, igMediaId } = args;

  const res = await axios.get<ArrayBuffer>(mediaUrl, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(res.data);

  const contentType = (res.headers?.['content-type'] || 'video/mp4').toString().split(';')[0].trim();
  const ext = contentType.includes('quicktime') ? 'mov' : 'mp4';

  // Key shape mirrors the existing media uploader convention: user-scoped, randomized.
  const key = `users/${userId}/instagram/${igMediaId}-${randomUUID()}.${ext}`;

  await uploadToR2(key, buffer, contentType);

  return { key, size: buffer.length, mimeType: contentType };
}
