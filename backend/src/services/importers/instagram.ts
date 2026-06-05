/**
 * Public Instagram profile scraper for the Phase 8 auto-sync.
 *
 * Source: hits IG's public `web_profile_info` JSON endpoint with realistic
 * browser headers — no OAuth, no Graph API. Single-tenant: the username
 * comes from `IG_USERNAME` env var.
 *
 * Trade-offs:
 *  - Works only for PUBLIC accounts.
 *  - IG can block / rate-limit / change the endpoint at any time —
 *    handle failures gracefully (orchestrator catches and logs).
 *  - CDN media URLs returned by IG expire within a few hours, so we
 *    download immediately rather than storing the URL for later.
 */
import axios from 'axios';
import { randomUUID } from 'crypto';
import { uploadToR2 } from '../storage.js';

const PROFILE_URL = (username: string) =>
  `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;

// Browser-ish headers. IG checks X-IG-App-ID against a known value for the
// public web app; without it the endpoint returns 401.
const IG_APP_ID = '936619743392459';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface IgMediaItem {
  id: string;
  mediaType: 'VIDEO' | 'REELS';
  mediaUrl: string;
  thumbnailUrl?: string;
  permalink?: string;
  caption?: string;
  timestamp: string;
}

export interface ListByUsernameArgs {
  username: string;
  sinceIso: string;
}

/**
 * Returns the user's recent video / reel posts that were published since
 * `sinceIso`. Filters out non-video media (photos, carousels without
 * video). Filters out items whose `video_url` is missing — that happens
 * for private posts or when IG returns a stripped payload.
 */
export async function listRecentVideosByUsername(args: ListByUsernameArgs): Promise<IgMediaItem[]> {
  const { username, sinceIso } = args;
  const since = new Date(sinceIso).getTime();

  const { data } = await axios.get(PROFILE_URL(username), {
    headers: {
      'User-Agent': USER_AGENT,
      'X-IG-App-ID': IG_APP_ID,
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  const edges = data?.data?.user?.edge_owner_to_timeline_media?.edges ?? [];

  const items: IgMediaItem[] = [];
  for (const edge of edges) {
    const node = edge?.node;
    if (!node || node.is_video !== true) continue;
    if (!node.video_url) continue;
    const tsMs = (node.taken_at_timestamp ?? 0) * 1000;
    if (tsMs < since) continue;

    const shortcode = node.shortcode as string | undefined;
    const caption: string | undefined = node.edge_media_to_caption?.edges?.[0]?.node?.text;

    items.push({
      id: String(node.id ?? shortcode ?? randomUUID()),
      // IG no longer distinguishes "REELS" vs "VIDEO" in this payload — we
      // call them all REELS since user reels are the common case.
      mediaType: 'REELS',
      mediaUrl: node.video_url,
      thumbnailUrl: node.display_url,
      permalink: shortcode ? `https://www.instagram.com/p/${shortcode}/` : undefined,
      caption,
      timestamp: new Date(tsMs).toISOString(),
    });
  }

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
 * Streams an IG CDN video into R2 under a user-scoped key. CDN URLs expire
 * quickly so this must be called soon after `listRecentVideosByUsername`.
 */
export async function downloadAndStoreInR2(args: DownloadAndStoreArgs): Promise<DownloadAndStoreResult> {
  const { mediaUrl, userId, igMediaId } = args;

  const res = await axios.get<ArrayBuffer>(mediaUrl, {
    responseType: 'arraybuffer',
    headers: { 'User-Agent': USER_AGENT },
  });
  const buffer = Buffer.from(res.data);

  const contentType = (res.headers?.['content-type'] || 'video/mp4').toString().split(';')[0].trim();
  const ext = contentType.includes('quicktime') ? 'mov' : 'mp4';

  // Sanitize igMediaId for filesystem-safe key; numeric IG IDs are fine but
  // shortcodes may contain characters we don't want in URLs.
  const safeId = igMediaId.replace(/[^A-Za-z0-9_-]/g, '');
  const key = `users/${userId}/instagram/${safeId}-${randomUUID()}.${ext}`;

  await uploadToR2(key, buffer, contentType);

  return { key, size: buffer.length, mimeType: contentType };
}
