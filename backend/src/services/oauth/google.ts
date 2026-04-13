import { google } from 'googleapis';
import { config } from '../../config.js';

function getOAuth2Client() {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri,
  );
}

export function getGoogleAuthUrl(state: string): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
    ],
    state,
  });
}

export async function exchangeGoogleCode(code: string) {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const youtube = google.youtube({ version: 'v3', auth: client });
  const { data } = await youtube.channels.list({
    part: ['snippet'],
    mine: true,
  });

  const channel = data.items?.[0];
  if (!channel) throw new Error('No YouTube channel found');

  return {
    platform: 'youtube' as const,
    accountId: channel.id!,
    accountName: channel.snippet?.title || 'YouTube Channel',
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token || null,
    tokenExpires: tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : null,
  };
}

export async function refreshGoogleToken(refreshToken: string) {
  const client = getOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();
  return {
    accessToken: credentials.access_token!,
    tokenExpires: credentials.expiry_date
      ? new Date(credentials.expiry_date).toISOString()
      : null,
  };
}
