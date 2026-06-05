import axios from 'axios';
import { db } from '../../db/index.js';
import { platformAccounts } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { refreshTikTokToken } from '../oauth/tiktok.js';
import type { PublisherMedia } from './instagram.js';

const INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
const STATUS_URL = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/';

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

  // 2. Init (with one auto-refresh retry on 401)
  let token = args.accessToken;
  const tryInit = async () => axios.post(INIT_URL, {
    post_info: {
      title: args.title || 'Untitled',
      privacy_level: 'SELF_ONLY', // sandbox-safe default; flip to PUBLIC_TO_EVERYONE post-audit
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
  }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });

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
      throw err;
    }
  }

  const publishId = initRes.data?.data?.publish_id;
  const uploadUrl = initRes.data?.data?.upload_url;
  if (!publishId || !uploadUrl) throw new Error('TikTok init returned no publish_id/upload_url');

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
