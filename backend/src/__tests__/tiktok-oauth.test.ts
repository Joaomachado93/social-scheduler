import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTikTokAuthUrl } from '../services/oauth/tiktok.js';

describe('getTikTokAuthUrl', () => {
  beforeEach(() => {
    process.env.TIKTOK_CLIENT_KEY = 'CK_TEST';
    process.env.TIKTOK_REDIRECT_URI = 'http://localhost:3001/api/video/tiktok/callback';
  });

  it('builds an authorize URL with the right scopes and state', () => {
    const url = new URL(getTikTokAuthUrl('STATE123'));
    expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
    expect(url.searchParams.get('client_key')).toBe('CK_TEST');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('user.info.basic,video.upload,video.publish');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3001/api/video/tiktok/callback');
    expect(url.searchParams.get('state')).toBe('STATE123');
  });
});

import { exchangeTikTokCode } from '../services/oauth/tiktok.js';
import axios from 'axios';
vi.mock('axios');

describe('exchangeTikTokCode', () => {
  beforeEach(() => {
    process.env.TIKTOK_CLIENT_KEY = 'CK_TEST';
    process.env.TIKTOK_CLIENT_SECRET = 'CS_TEST';
    process.env.TIKTOK_REDIRECT_URI = 'http://localhost:3001/api/video/tiktok/callback';
    vi.resetAllMocks();
  });

  it('exchanges a code for tokens and resolves the user identity', async () => {
    vi.mocked(axios.post).mockImplementation(async (url: string) => {
      if (url === 'https://open.tiktokapis.com/v2/oauth/token/') {
        return { data: { access_token: 'AT', refresh_token: 'RT', expires_in: 86400, open_id: 'OID' } } as any;
      }
      throw new Error(`Unexpected POST ${url}`);
    });
    vi.mocked(axios.get).mockImplementation(async (url: string) => {
      if (url.startsWith('https://open.tiktokapis.com/v2/user/info/')) {
        return { data: { data: { user: { open_id: 'OID', display_name: 'Joao' } } } } as any;
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    const result = await exchangeTikTokCode('CODE123');
    expect(result.platform).toBe('tiktok');
    expect(result.accountId).toBe('OID');
    expect(result.accountName).toBe('Joao');
    expect(result.accessToken).toBe('AT');
    expect(result.refreshToken).toBe('RT');
    expect(result.tokenExpires).toBeTypeOf('string');
  });
});
