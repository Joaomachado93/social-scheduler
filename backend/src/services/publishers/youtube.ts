import { google } from 'googleapis';
import axios from 'axios';
import { Readable } from 'stream';
import { config } from '../../config.js';
import { refreshGoogleToken } from '../oauth/google.js';
import { db } from '../../db/index.js';
import { platformAccounts } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { PublisherMedia } from './instagram.js';

export async function publishToYouTube(
  platformAccountId: number,
  accessToken: string,
  refreshToken: string | null,
  title: string,
  description: string,
  mediaFiles: PublisherMedia[],
  publishAt?: string | null,
): Promise<string> {

  const videos = mediaFiles.filter(m => m.mediaType === 'video');
  if (videos.length === 0) {
    throw new Error('YouTube requires at least one video');
  }

  let currentToken = accessToken;
  if (refreshToken) {
    try {
      const refreshed = await refreshGoogleToken(refreshToken);
      currentToken = refreshed.accessToken;
      await db.update(platformAccounts)
        .set({
          accessToken: refreshed.accessToken,
          tokenExpires: refreshed.tokenExpires,
        })
        .where(eq(platformAccounts.id, platformAccountId));
    } catch (err) {
      console.warn('Token refresh failed, using existing token:', err);
    }
  }

  const auth = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri,
  );
  auth.setCredentials({ access_token: currentToken });

  const youtube = google.youtube({ version: 'v3', auth });

  const video = videos[0];

  // YouTube SDK requires a stream/buffer body — fetch the watermarked file from R2
  const res = await axios.get<ArrayBuffer>(video.publicUrl, { responseType: 'arraybuffer' });
  const body = Readable.from(Buffer.from(res.data));

  const response = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: title || 'Untitled',
        description: description || '',
      },
      // Native YouTube scheduling: upload as private NOW with publishAt set,
      // YT promotes to public at that timestamp on its own. Lets the
      // backend dyno sleep between uploads — YT becomes the timer source.
      // Falls back to immediate public upload when publishAt isn't provided.
      status: publishAt
        ? {
            privacyStatus: 'private',
            publishAt,
            selfDeclaredMadeForKids: false,
          }
        : {
            privacyStatus: 'public',
            selfDeclaredMadeForKids: false,
          },
    },
    media: {
      body,
    },
  });

  return response.data.id || '';
}
