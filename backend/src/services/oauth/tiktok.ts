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
          const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
          const clientSecret = process.env.TIKTOK_CLIENT_SECRET || '';
          const redirectUri = process.env.TIKTOK_REDIRECT_URI || '';

        console.log('[TikTok] Starting token exchange with client_key:', clientKey.substring(0, 8) + '...');
          console.log('[TikTok] redirect_uri:', redirectUri);
          console.log('[TikTok] code length:', code.length);

        const body = new URLSearchParams({
                          client_key: clientKey,
                          client_secret: clientSecret,
                          code,
                          grant_type: 'authorization_code',
                          redirect_uri: redirectUri,
        }).toString();

        let tokenRes: any;
          try {
                            tokenRes = await axios.post(TOKEN_URL, body, {
                                                      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            });
          } catch (axiosErr: any) {
                            const status = axiosErr.response?.status;
                            const data = JSON.stringify(axiosErr.response?.data);
                            console.error(`[TikTok] Token request HTTP ${status}:`, data);
                            throw new Error(`TikTok token HTTP ${status}: ${data}`);
          }

        const rawData = tokenRes.data;
          console.log('[TikTok] Token exchange raw response:', JSON.stringify(rawData));
          const tokenData = (rawData.data && rawData.data.access_token) ? rawData.data : rawData;
          const { access_token, refresh_token, expires_in } = tokenData;

        if (!access_token) {
                          console.error('[TikTok] No access_token in response:', JSON.stringify(rawData));
                          throw new Error('TikTok token exchange returned no access_token: ' + JSON.stringify(rawData));
        }

        const userRes = await axios.get(
                          `${USER_INFO_URL}?fields=open_id,display_name`,
          { headers: { Authorization: `Bearer ${access_token}` } },
                  );
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
          const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
          const clientSecret = process.env.TIKTOK_CLIENT_SECRET || '';

        const res = await axios.post(
                          TOKEN_URL,
                          new URLSearchParams({
                                                    client_key: clientKey,
                                                    client_secret: clientSecret,
                                                    grant_type: 'refresh_token',
                                                    refresh_token: refreshToken,
                          }).toString(),
          {
                                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
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
