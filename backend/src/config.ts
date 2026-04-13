import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',

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

  watermark: {
    position: process.env.WATERMARK_POSITION || 'southeast',
    opacity: parseFloat(process.env.WATERMARK_OPACITY || '0.7'),
    margin: parseInt(process.env.WATERMARK_MARGIN || '20', 10),
    scale: parseFloat(process.env.WATERMARK_SCALE || '0.15'),
  },

  paths: {
    uploads: resolve(__dirname, '../uploads'),
    watermark: resolve(__dirname, '../watermark/logo.png'),
    db: resolve(__dirname, '../data/scheduler.db'),
  },
};
