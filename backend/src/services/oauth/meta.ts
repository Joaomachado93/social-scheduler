import axios from 'axios';
import { config } from '../../config.js';

const GRAPH_URL = 'https://graph.facebook.com/v19.0';

export function getMetaAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.meta.appId,
    redirect_uri: config.meta.redirectUri,
    scope: 'pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish',
    response_type: 'code',
    state,
  });
  return `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
}

export async function exchangeMetaCode(code: string) {
  // Get short-lived token
  const { data: tokenData } = await axios.get(`${GRAPH_URL}/oauth/access_token`, {
    params: {
      client_id: config.meta.appId,
      client_secret: config.meta.appSecret,
      redirect_uri: config.meta.redirectUri,
      code,
    },
  });

  // Exchange for long-lived token
  const { data: longLived } = await axios.get(`${GRAPH_URL}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: config.meta.appId,
      client_secret: config.meta.appSecret,
      fb_exchange_token: tokenData.access_token,
    },
  });

  // Get pages
  const { data: pagesData } = await axios.get(`${GRAPH_URL}/me/accounts`, {
    params: { access_token: longLived.access_token },
  });

  const accounts: Array<{
    platform: 'facebook' | 'instagram';
    accountId: string;
    accountName: string;
    accessToken: string;
    tokenExpires: string;
  }> = [];

  for (const page of pagesData.data) {
    // Facebook page
    accounts.push({
      platform: 'facebook',
      accountId: page.id,
      accountName: page.name,
      accessToken: page.access_token,
      tokenExpires: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // ~60 days
    });

    // Check for Instagram Business account
    try {
      const { data: igData } = await axios.get(`${GRAPH_URL}/${page.id}`, {
        params: {
          fields: 'instagram_business_account',
          access_token: page.access_token,
        },
      });

      if (igData.instagram_business_account) {
        const { data: igProfile } = await axios.get(
          `${GRAPH_URL}/${igData.instagram_business_account.id}`,
          { params: { fields: 'username', access_token: page.access_token } }
        );

        accounts.push({
          platform: 'instagram',
          accountId: igData.instagram_business_account.id,
          accountName: igProfile.username || page.name,
          accessToken: page.access_token, // Instagram uses the page token
          tokenExpires: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    } catch {}
  }

  return accounts;
}
