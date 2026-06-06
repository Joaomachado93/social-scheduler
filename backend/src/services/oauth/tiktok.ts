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
                        scope: 'user.info.basic,video.publish,video.upload',
                        redirect_uri: process.env.TIKTOK_REDIRECT_URI || '',
                        state,
        });
        return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type TikTokAccountInfo = {
        platform: 'tiktok';
        accountId: string;
        username: string;
        displayName: string;
        avatarUrl: string;
        accessToken: string;
        refreshToken: string;
        tokenExpiresAt: Date;
};

export async function exchangeTikTokCode(code: string): Promise<TikTokAccountInfo> {
        const client_key = process.env.TIKTOK_CLIENT_KEY || '';
        const client_secret = process.env.TIKTOK_CLIENT_SECRET || '';
        const redirect_uri = process.env.TIKTOK_REDIRECT_URI || '';

    const params = new URLSearchParams();
        params.append('client_key', client_key);
        params.append('client_secret', client_secret);
        params.append('code', code);
        params.append('grant_type', 'authorization_code');
        params.append('redirect_uri', redirect_uri);

    console.log('[TikTok] Starting token exchange with client_key:', client_key.substring(0, 8) + '...');
        console.log('[TikTok] client_key length:', client_key.length);
        console.log('[TikTok] redirect_uri:', redirect_uri);

    const tokenResponse = await axios.post(TOKEN_URL, params.toString(), {
                headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'Cache-Control': 'no-cache',
                },
    });

    const tokenData = tokenResponse.data;
        console.log('[TikTok] Token exchange raw response:', JSON.stringify(tokenData));

    if (!tokenData.access_token) {
                throw new Error(`TikTok token exchange returned no access_token: ${JSON.stringify(tokenData)}`);
    }

    const userResponse = await axios.get(`${USER_INFO_URL}?fields=open_id,display_name,avatar_url`, {
                headers: {
                                'Authorization': `Bearer ${tokenData.access_token}`,
                },
    });

    const userData = userResponse.data?.data?.user || {};

    return {
                platform: 'tiktok',
                accountId: userData.open_id || tokenData.open_id || '',
                username: userData.display_name || '',
                displayName: userData.display_name || '',
                avatarUrl: userData.avatar_url || '',
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token || '',
                tokenExpiresAt: new Date(Date.now() + (tokenData.expires_in || 86400) * 1000),
    };
}

export async function refreshTikTokToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
        const client_key = process.env.TIKTOK_CLIENT_KEY || '';
        const client_secret = process.env.TIKTOK_CLIENT_SECRET || '';

    const params = new URLSearchParams();
        params.append('client_key', client_key);
        params.append('client_secret', client_secret);
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', refreshToken);

    const response = await axios.post(TOKEN_URL, params.toString(), {
                headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'Cache-Control': 'no-cache',
                },
    });

    const data = response.data;
        if (!data.access_token) {
                    throw new Error(`TikTok token refresh failed: ${JSON.stringify(data)}`);
        }

    return {
                accessToken: data.access_token,
                refreshToken: data.refresh_token || refreshToken,
                expiresAt: new Date(Date.now() + (data.expires_in || 86400) * 1000),
    };
}
