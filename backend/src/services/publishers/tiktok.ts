import axios from 'axios';
import { db } from '../../db/index.js';
import { platformAccounts } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { refreshTikTokToken } from '../oauth/tiktok.js';
import type { PublisherMedia } from './instagram.js';

const INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
const INBOX_INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/';
const STATUS_URL = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/';
const CREATOR_INFO_URL = 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/';

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 5 * 60_000;
const MIN_CHUNK_SIZE = 5 * 1024 * 1024;     // 5 MB
const TARGET_CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB
const SINGLE_CHUNK_MAX = 64 * 1024 * 1024;  // 64 MB

export type PublishToTikTokArgs = {
  platformAccountId: number;
  accessToken: string;
  refreshToken: string | null;
  title: string;
  description: string;
  mediaFiles: PublisherMedia[];
};

export async function publishToTikTok(args: PublishToTikTokArgs): Promise<string> {
  const videos = args.mediaFiles.filter(m => m.mediaType === 'video');
  if (videos.length === 0) throw new Error('TikTok requires at least one video');
  const video = videos[0];

  // 1. Download bytes from R2
  const dl = await axios.get<ArrayBuffer>(video.publicUrl, { responseType: 'arraybuffer' });
  const bytes = Buffer.from(dl.data);
  const totalSize = bytes.length;

  // Chunk plan
  const chunkSize = totalSize <= SINGLE_CHUNK_MAX
    ? totalSize
    : Math.max(MIN_CHUNK_SIZE, TARGET_CHUNK_SIZE);
  const totalChunkCount = Math.ceil(totalSize / chunkSize);

  let token = args.accessToken;

  // 2a. Query creator info. TikTok rejects the init with 403 if the
  // requested privacy_level isn't in the user's allowed list — that list
  // depends on whether the app is audited and the user's account settings.
  // We pick the first allowed level (typically SELF_ONLY in sandbox) so the
  // publisher works in both sandbox and production without code changes.
  let privacyLevel = 'SELF_ONLY';
  try {
    const ciRes = await axios.post(
      CREATOR_INFO_URL,
      {},
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' } },
    );
    const allowed: string[] = ciRes.data?.data?.privacy_level_options || [];
    if (allowed.length > 0) {
      privacyLevel = allowed.includes('SELF_ONLY') ? 'SELF_ONLY' : allowed[0];
    }
    console.log('[tiktok-publish] creator_info allowed=', JSON.stringify(allowed), 'chose=', privacyLevel);
  } catch (err: any) {
    const body = err?.response?.data;
    console.error('[tiktok-publish] creator_info failed:',
      err?.response?.status, JSON.stringify(body));
    throw new Error(`TikTok creator_info failed (status ${err?.response?.status}): ${JSON.stringify(body)}`);
  }

  // 2b. Init (with one auto-refresh retry on 401, full-body error on others)
  const tryInit = async () => axios.post(INIT_URL, {
    post_info: {
      title: args.title || 'Untitled',
      privacy_level: privacyLevel,
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
    },
    source_info: {
      source: 'FILE_UPLOAD',
      video_size: totalSize,
      chunk_size: chunkSize,
      total_chunk_count: totalChunkCount,
    },
  }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' } });

  let initRes;
  try {
    initRes = await tryInit();
  } catch (err: any) {
    if (err?.response?.status === 401 && args.refreshToken) {
      const refreshed = await refreshTikTokToken(args.refreshToken);
      token = refreshed.accessToken;
      await db.update(platformAccounts).set({
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        tokenExpires: refreshed.tokenExpires,
      }).where(eq(platformAccounts.id, args.platformAccountId));
      initRes = await tryInit();
    } else {
      const body = err?.response?.data;
      console.error('[tiktok-publish] init failed:',
        err?.response?.status, JSON.stringify(body));
      throw new Error(`TikTok init failed (status ${err?.response?.status}): ${JSON.stringify(body)}`);
    }
  }

  const publishId = initRes.data?.data?.publish_id;
  const uploadUrl = initRes.data?.data?.upload_url;
  if (!publishId || !uploadUrl) {
    throw new Error(`TikTok init returned no publish_id/upload_url: ${JSON.stringify(initRes.data)}`);
  }

  // 3. Upload chunks
  for (let i = 0; i < totalChunkCount; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, totalSize) - 1;
    const chunk = bytes.subarray(start, end + 1);
    await axios.put(uploadUrl, chunk, {
      headers: {
        'Content-Type': video.mimeType || 'video/mp4',
        'Content-Length': String(chunk.length),
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  }

  // 4. Poll
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const st = await axios.post(STATUS_URL,
      { publish_id: publishId },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
    );
    const status = st.data?.data?.status;
    if (status === 'PUBLISH_COMPLETE') return publishId;
    if (status === 'FAILED') {
      throw new Error(`TikTok publish FAILED: ${JSON.stringify(st.data?.data?.fail_reason || st.data)}`);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error('TikTok publish polling timed out');
}

/**
 * Inbox/Drafts variant. Uploads the video to the user's TikTok app inbox
 * — appears as a draft notification. The user opens the TikTok app, sees
 * the draft, fills caption and visibility, and taps Post. Works in
 * unaudited sandbox apps without the `unaudited_client_can_only_post_to_
 * private_accounts` restriction because we're not publishing — only
 * uploading. Caller controls caption manually on phone.
 */
export async function publishToTikTokInbox(args: PublishToTikTokArgs): Promise<string> {
  const videos = args.mediaFiles.filter(m => m.mediaType === 'video');
  if (videos.length === 0) throw new Error('TikTok requires at least one video');
  const video = videos[0];

  const dl = await axios.get<ArrayBuffer>(video.publicUrl, { responseType: 'arraybuffer' });
  const bytes = Buffer.from(dl.data);
  const totalSize = bytes.length;

  const chunkSize = totalSize <= SINGLE_CHUNK_MAX
    ? totalSize
    : Math.max(MIN_CHUNK_SIZE, TARGET_CHUNK_SIZE);
  const totalChunkCount = Math.ceil(totalSize / chunkSize);

  let token = args.accessToken;
  const tryInit = async () => axios.post(INBOX_INIT_URL, {
    source_info: {
      source: 'FILE_UPLOAD',
      video_size: totalSize,
      chunk_size: chunkSize,
      total_chunk_count: totalChunkCount,
    },
  }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' } });

  let initRes;
  try {
    initRes = await tryInit();
  } catch (err: any) {
    if (err?.response?.status === 401 && args.refreshToken) {
      const refreshed = await refreshTikTokToken(args.refreshToken);
      token = refreshed.accessToken;
      await db.update(platformAccounts).set({
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        tokenExpires: refreshed.tokenExpires,
      }).where(eq(platformAccounts.id, args.platformAccountId));
      initRes = await tryInit();
    } else {
      const body = err?.response?.data;
      console.error('[tiktok-inbox] init failed:',
        err?.response?.status, JSON.stringify(body));
      throw new Error(`TikTok inbox init failed (status ${err?.response?.status}): ${JSON.stringify(body)}`);
    }
  }

  const publishId = initRes.data?.data?.publish_id;
  const uploadUrl = initRes.data?.data?.upload_url;
  if (!publishId || !uploadUrl) {
    throw new Error(`TikTok inbox init returned no publish_id/upload_url: ${JSON.stringify(initRes.data)}`);
  }

  for (let i = 0; i < totalChunkCount; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, totalSize) - 1;
    const chunk = bytes.subarray(start, end + 1);
    await axios.put(uploadUrl, chunk, {
      headers: {
        'Content-Type': video.mimeType || 'video/mp4',
        'Content-Length': String(chunk.length),
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  }

  // Inbox terminal status is SEND_TO_USER_INBOX. We accept that plus the
  // shared PUBLISH_COMPLETE / FAILED to be defensive across TikTok docs
  // versions.
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const st = await axios.post(STATUS_URL,
      { publish_id: publishId },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
    );
    const status = st.data?.data?.status;
    if (status === 'SEND_TO_USER_INBOX' || status === 'PUBLISH_COMPLETE') return publishId;
    if (status === 'FAILED') {
      throw new Error(`TikTok inbox upload FAILED: ${JSON.stringify(st.data?.data?.fail_reason || st.data)}`);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error('TikTok inbox polling timed out');
}
