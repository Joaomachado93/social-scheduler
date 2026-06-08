/**
 * Native YouTube scheduling: upload the video NOW as private with
 * `publishAt` set to the desired public-release timestamp. YT becomes
 * the timer source, the Render dyno can sleep between sync runs.
 *
 * Shared by the IG auto-sync (overnight batch) and the admin
 * `schedule-test-post` endpoint. The cron-based publishPost path in
 * scheduler.ts still uses immediate-public upload (no publishAt) so
 * existing TikTok-only or fallback flows are untouched.
 */
import { config } from '../../config.js';
import { generateYouTubeCaption } from '../captionAi.js';
import { publishToYouTube } from './youtube.js';
import type { PublisherMedia } from './instagram.js';

// IG captions sometimes carry BOM / RTL marks / zero-width chars that look
// fine but fail YT title validation. Same regex as scheduler.ts uses.
const ZERO_WIDTH_RE = /[​-‏‪-‮⁠-⁯﻿]/g;

function sanitiseTitle(s: string): string {
  return s.replace(ZERO_WIDTH_RE, '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 95);
}

export interface YouTubeCaptionPayload {
  title: string;
  description: string;
}

export async function buildYouTubeCaption(rawCaption: string): Promise<YouTubeCaptionPayload> {
  const cleanFirstLine = sanitiseTitle((rawCaption || '').split('\n')[0] || '');
  let title = cleanFirstLine || 'Untitled';
  let description: string;

  if (config.ai.enabled) {
    try {
      const ai = await generateYouTubeCaption(rawCaption || '');
      const aiTitle = sanitiseTitle(ai.title);
      if (aiTitle) title = aiTitle;
      const hashtagLine = ai.hashtags.map(h => `#${h}`).join(' ');
      description = `${ai.description}\n\n${hashtagLine}\n\n#Shorts`.trimEnd();
      return { title, description };
    } catch (err: any) {
      console.warn('[yt-native] AI caption failed, falling back to raw:', err?.message || err);
    }
  }

  const raw = rawCaption || '';
  description = raw.startsWith('#Shorts') ? raw : `#Shorts\n\n${raw}`.trimEnd();
  return { title, description };
}

export interface NativeScheduleOpts {
  platformAccountId: number;
  accessToken: string;
  refreshToken: string | null;
  caption: string;
  publicUrl: string;
  scheduledAtIso: string;
  mimeType?: string;
}

/**
 * Throws if the call to YT fails. Caller decides what to do — typically
 * mark the postPlatforms leg as `failed` (admin endpoint) or leave it
 * `pending` so the cron retries at scheduledAt (IG auto-sync).
 *
 * YT requires publishAt strictly in the future; the >60s buffer is also
 * a safety net for clock skew between Render and Google.
 */
export async function scheduleYouTubeNative(opts: NativeScheduleOpts): Promise<string> {
  const scheduledMs = new Date(opts.scheduledAtIso).getTime();
  if (!(scheduledMs > Date.now() + 60_000)) {
    throw new Error(`scheduledAt ${opts.scheduledAtIso} is not >60s in the future`);
  }

  const { title, description } = await buildYouTubeCaption(opts.caption);

  const media: PublisherMedia[] = [{
    id: 0,
    mediaType: 'video',
    mimeType: opts.mimeType || 'video/mp4',
    publicUrl: opts.publicUrl,
  }];

  return publishToYouTube(
    opts.platformAccountId,
    opts.accessToken,
    opts.refreshToken,
    title,
    description,
    media,
    opts.scheduledAtIso,
  );
}
