// Reading env vars directly inside each function (not via config) so that test
// beforeEach mutations to process.env are picked up without resetModules.
import axios from 'axios';

const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const USER_INFO_URL = 'https://open.tiktokapis.com/v2/user/info/';

export function getTikTokAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY || '',
    response_type: 'code',
    scope: 'user.info.basic,video.upload,video.publish',
    redirect_uri: process.env.TIKTOK_REDIRECT_URI || '',
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type TikTokAccountInfo = {
  platform: 'tiktok';
  accountId: string;
  accountName: string;
  accessToken: string;
  refreshToken: string;
  tokenExpires: string | null;
};

async function postForm(url: string, body: Record<string, string>) {
  return axios.post(url, new URLSearchParams(body).toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    },
  });
}

export async function exchangeTikTokCode(code: string): Promise<TikTokAccountInfo> {
  // .trim() guards against trailing whitespace in Render env values that
  // silently break the exchange with `invalid_client`.
  const clientKey = (process.env.TIKTOK_CLIENT_KEY || '').trim();
  const clientSecret = (process.env.TIKTOK_CLIENT_SECRET || '').trim();
  const redirectUri = (process.env.TIKTOK_REDIRECT_URI || '').trim();

  const tokenRes = await postForm(TOKEN_URL, {
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  const token = tokenRes.data;
  if (!token?.access_token) {
    throw new Error(`TikTok token exchange failed: ${JSON.stringify(token)}`);
  }

  const userRes = await axios.get(
    `${USER_INFO_URL}?fields=open_id,display_name`,
    { headers: { Authorization: `Bearer ${token.access_token}` } },
  );
  const user = userRes.data?.data?.user;
  if (!user?.open_id) {
    throw new Error(`TikTok user info missing open_id: ${JSON.stringify(userRes.data)}`);
  }

  return {
    platform: 'tiktok',
    accountId: user.open_id,
    accountName: user.display_name || 'TikTok Account',
    accessToken: token.access_token,
    refreshToken: token.refresh_token || '',
    tokenExpires: token.expires_in
      ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString()
      : null,
  };
}

export async function refreshTikTokToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  tokenExpires: string | null;
}> {
  const clientKey = (process.env.TIKTOK_CLIENT_KEY || '').trim();
  const clientSecret = (process.env.TIKTOK_CLIENT_SECRET || '').trim();

  const res = await postForm(TOKEN_URL, {
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const data = res.data;
  if (!data?.access_token) {
    throw new Error(`TikTok token refresh failed: ${JSON.stringify(data)}`);
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    tokenExpires: data.expires_in
      ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
      : null,
  };
}
