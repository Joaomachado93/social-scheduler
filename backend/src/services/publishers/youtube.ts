import { google } from 'googleapis';
import { createReadStream } from 'fs';
import { config } from '../../config.js';
import { refreshGoogleToken } from '../oauth/google.js';
import { db } from '../../db/index.js';
import { platformAccounts } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

export async function publishToYouTube(
  platformAccountId: number,
  accessToken: string,
  refreshToken: string | null,
  title: string,
  description: string,
  mediaFiles: Array<{ watermarkedPath: string | null; originalPath: string; mediaType: string }>,
): Promise<string> {

  const videos = mediaFiles.filter(m => m.mediaType === 'video');
  if (videos.length === 0) {
    throw new Error('YouTube requires at least one video');
  }

  // Refresh token if needed
  let currentToken = accessToken;
  if (refreshToken) {
    try {
      const refreshed = await refreshGoogleToken(refreshToken);
      currentToken = refreshed.accessToken;
      // Update stored token
      db.update(platformAccounts)
        .set({
          accessToken: refreshed.accessToken,
          tokenExpires: refreshed.tokenExpires,
        })
        .where(eq(platformAccounts.id, platformAccountId))
        .run();
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
  const filePath = video.watermarkedPath || video.originalPath;

  const response = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: title || 'Untitled',
        description: description || '',
      },
      status: {
        privacyStatus: 'public',
      },
    },
    media: {
      body: createReadStream(filePath),
    },
  });

  return response.data.id || '';
}
