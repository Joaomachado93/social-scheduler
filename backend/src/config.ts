import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  apiUrl: process.env.API_URL || 'http://localhost:3001',
  databaseUrl: process.env.DATABASE_URL || '',

  meta: {
    appId: process.env.META_APP_ID || '',
    appSecret: process.env.META_APP_SECRET || '',
    redirectUri: process.env.META_REDIRECT_URI || 'http://localhost:3001/api/platforms/facebook/callback',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/platforms/youtube/callback',
  },

  tiktok: {
    clientKey: process.env.TIKTOK_CLIENT_KEY || '',
    clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
    redirectUri: process.env.TIKTOK_REDIRECT_URI || 'http://localhost:3001/api/video/tiktok/callback',
  },

  watermark: {
    position: process.env.WATERMARK_POSITION || 'southeast',
    opacity: parseFloat(process.env.WATERMARK_OPACITY || '0.7'),
    margin: parseInt(process.env.WATERMARK_MARGIN || '20', 10),
    scale: parseFloat(process.env.WATERMARK_SCALE || '0.15'),
  },

  // Background job that scrapes a public Instagram profile and schedules
  // each new video for publication on YouTube Shorts + TikTok. No UI —
  // runs on a cron. Single-tenant: one IG_USERNAME per deployment.
  //
  // Publishing-window model: the sync cron runs once a day (default 3am
  // local), spacing videos `spacingHours` apart but only within
  // [windowStartHour, windowEndHour] in the configured timezone. Slots
  // that would fall outside the window are pushed to windowStartHour of
  // the next day.
  instagramAutoSync: {
    enabled: (process.env.IG_AUTOSYNC_ENABLED || 'false').toLowerCase() === 'true',
    username: process.env.IG_USERNAME || '',
    cron: process.env.IG_AUTOSYNC_CRON || '0 3 * * *',
    timezone: process.env.IG_AUTOSYNC_TIMEZONE || 'Europe/Lisbon',
    lookbackHours: parseInt(process.env.IG_AUTOSYNC_LOOKBACK_HOURS || '48', 10),
    spacingHours: parseInt(process.env.IG_AUTOSYNC_SPACING_HOURS || '2', 10),
    minDelayMinutes: parseInt(process.env.IG_AUTOSYNC_MIN_DELAY_MINUTES || '60', 10),
    windowStartHour: parseInt(process.env.IG_AUTOSYNC_WINDOW_START_HOUR || '8', 10),
    windowEndHour: parseInt(process.env.IG_AUTOSYNC_WINDOW_END_HOUR || '22', 10),
  },

  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket: process.env.R2_BUCKET || '',
    publicUrl: (process.env.R2_PUBLIC_URL || '').replace(/\/$/, ''),
    logoKey: process.env.R2_LOGO_KEY || 'watermark/logo.png',
  },

  // Personal long-lived tokens for the app owner. When set, every new user
  // session is auto-seeded with these accounts in platform_accounts so the
  // user doesn't have to go through OAuth. Each block is independent — set
  // only the platforms you want available.
  owner: {
    facebook: {
      pageId: process.env.OWNER_FB_PAGE_ID || '',
      pageToken: process.env.OWNER_FB_PAGE_TOKEN || '',
      pageName: process.env.OWNER_FB_PAGE_NAME || '',
    },
    instagram: {
      businessId: process.env.OWNER_IG_BUSINESS_ID || '',
      // Instagram uses the same Page token as Facebook unless overridden.
      token: process.env.OWNER_IG_TOKEN || process.env.OWNER_FB_PAGE_TOKEN || '',
      businessName: process.env.OWNER_IG_BUSINESS_NAME || '',
    },
    youtube: {
      channelId: process.env.OWNER_YT_CHANNEL_ID || '',
      accessToken: process.env.OWNER_YT_ACCESS_TOKEN || '',
      refreshToken: process.env.OWNER_YT_REFRESH_TOKEN || '',
      channelName: process.env.OWNER_YT_CHANNEL_NAME || '',
    },
    tiktok: {
      openId: process.env.OWNER_TIKTOK_OPEN_ID || '',
      accessToken: process.env.OWNER_TIKTOK_ACCESS_TOKEN || '',
      refreshToken: process.env.OWNER_TIKTOK_REFRESH_TOKEN || '',
      displayName: process.env.OWNER_TIKTOK_DISPLAY_NAME || '',
    },
  },
};
