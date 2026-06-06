// Reading env vars directly inside each function (not via config) so that test
// beforeEach mutations to process.env are always picked up without resetModules.
import axios from 'axios';

const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const USER_INFO_URL = 'https://open.tiktokapis.com/v2/user/info/';

export function getTikTokAuthUrl(state: string): string {
      const params = new URLSearchParams({
              client_key: process.env.TIKTOK_CLIENT_KEY || '',
              response_type: 'code',
              scope: 'user.info.basic,video.upload',
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

export async function exchangeTikTokCode(code: string): Promise<TikTokAccountInfo> {
      let tokenRes: any;
      try {
              tokenRes = await axios.post(
                        TOKEN_URL,
                        new URLSearchParams({
                                    client_key: process.env.TIKTOK_CLIENT_KEY || '',
                                    client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
                                    code,
                                    grant_type: 'authorization_code',
                                    redirect_uri: process.env.TIKTOK_REDIRECT_URI || '',
                        }).toString(),
                  { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
                      );
      } catch (err: any) {
              const errData = err?.response?.data;
              const status = err?.response?.status;
              console.error('[TikTok] Token exchange HTTP error:', status, JSON.stringify(errData));
              throw new Error(`TikTok token exchange HTTP ${status}: ${JSON.stringify(errData)}`);
      }

  const rawData = tokenRes.data;
      console.log('[TikTok] Token exchange raw response:', JSON.stringify(rawData));

  if (rawData?.error?.code && rawData.error.code !== 'ok') {
          console.error('[TikTok] Token exchange API error:', JSON.stringify(rawData.error));
          throw new Error(`TikTok API error: ${rawData.error.code} - ${rawData.error.message}`);
  }

  const tokenData = (rawData.data && rawData.data.access_token) ? rawData.data : rawData;
      const { access_token, refresh_token, expires_in } = tokenData;

  if (!access_token) {
          console.error('[TikTok] No access_token. Full response:', JSON.stringify(rawData));
          throw new Error('TikTok token exchange returned no access_token');
  }

  let userRes: any;
      try {
              userRes = await axios.get(
                        `${USER_INFO_URL}?fields=open_id,display_name`,
                  { headers: { Authorization: `Bearer ${access_token}` } },
                      );
      } catch (err: any) {
              const errData = err?.response?.data;
              console.error('[TikTok] User info HTTP error:', err?.response?.status, JSON.stringify(errData));
              throw new Error(`TikTok user info HTTP ${err?.response?.status}: ${JSON.stringify(errData)}`);
      }

  console.log('[TikTok] User info raw response:', JSON.stringify(userRes.data));
      const user = userRes.data?.data?.user;
      if (!user?.open_id) throw new Error('TikTok user info missing open_id');

  return {
          platform: 'tiktok',
          accountId: user.open_id,
          accountName: user.display_name || 'TikTok Account',
          accessToken: access_token,
          refreshToken: refresh_token || '',
          tokenExpires: expires_in
            ? new Date(Date.now() + Number(expires_in) * 1000).toISOString()
                    : null,
  };
}

export async function refreshTikTokToken(refreshToken: string) {
      const res = await axios.post(
              TOKEN_URL,
              new URLSearchParams({
                        client_key: process.env.TIKTOK_CLIENT_KEY || '',
                        client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
                        grant_type: 'refresh_token',
                        refresh_token: refreshToken,
              }).toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
            );
      const rawData = res.data;
      const tokenData = (rawData.data && rawData.data.access_token) ? rawData.data : rawData;
      const { access_token, refresh_token, expires_in } = tokenData;
      return {
              accessToken: access_token as string,
              refreshToken: (refresh_token as string) || refreshToken,
              tokenExpires: expires_in
                ? new Date(Date.now() + Number(expires_in) * 1000).toISOString()
                        : null,
      };
}
