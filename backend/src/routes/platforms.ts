import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { platformAccounts } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { authGuard, JwtPayload } from '../middleware/auth.js';
import { getMetaAuthUrl, exchangeMetaCode } from '../services/oauth/meta.js';
import { getGoogleAuthUrl, exchangeGoogleCode } from '../services/oauth/google.js';
import { config } from '../config.js';

type OAuthState = { userId: number };

function signOAuthState(userId: number): string {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: '15m' });
}

function verifyOAuthState(state: string): OAuthState {
  const payload = jwt.verify(state, config.jwtSecret) as { userId: number };
  if (typeof payload.userId !== 'number') throw new Error('Invalid OAuth state payload');
  return { userId: payload.userId };
}

export async function platformRoutes(app: FastifyInstance) {
  // List connected platforms (auth required)
  app.get('/api/platforms', { preHandler: authGuard }, async (request) => {
    const user = (request as any).user as JwtPayload;
    const accounts = await db.select().from(platformAccounts)
      .where(eq(platformAccounts.userId, user.userId));
    return accounts.map(a => ({
      id: a.id,
      platform: a.platform,
      accountName: a.accountName,
      accountId: a.accountId,
      createdAt: a.createdAt,
    }));
  });

  // Get auth URL for a platform
  app.get('/api/platforms/:platform/auth-url', { preHandler: authGuard }, async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    const { platform } = request.params as { platform: string };

    const state = signOAuthState(user.userId);

    if (platform === 'facebook' || platform === 'instagram') {
      return { url: getMetaAuthUrl(state) };
    } else if (platform === 'youtube') {
      return { url: getGoogleAuthUrl(state) };
    }

    return reply.status(400).send({ error: 'Unknown platform' });
  });

  // Meta OAuth callback
  app.get('/api/platforms/facebook/callback', async (request, reply) => {
    const { code, state } = request.query as { code: string; state: string };

    try {
      const { userId } = verifyOAuthState(state);
      const accounts = await exchangeMetaCode(code);

      for (const account of accounts) {
        await db.delete(platformAccounts)
          .where(and(
            eq(platformAccounts.userId, userId),
            eq(platformAccounts.platform, account.platform),
            eq(platformAccounts.accountId, account.accountId),
          ));

        await db.insert(platformAccounts).values({
          userId,
          platform: account.platform,
          accountId: account.accountId,
          accountName: account.accountName,
          accessToken: account.accessToken,
          tokenExpires: account.tokenExpires,
        });
      }

      return reply.redirect(`${config.appUrl}/platforms?connected=facebook`);
    } catch (err: any) {
      console.error('Meta OAuth error:', err.message);
      return reply.redirect(`${config.appUrl}/platforms?error=meta_auth_failed`);
    }
  });

  // Google OAuth callback
  app.get('/api/platforms/youtube/callback', async (request, reply) => {
    const { code, state } = request.query as { code: string; state: string };

    try {
      const { userId } = verifyOAuthState(state);
      const account = await exchangeGoogleCode(code);

      await db.delete(platformAccounts)
        .where(and(
          eq(platformAccounts.userId, userId),
          eq(platformAccounts.platform, 'youtube'),
          eq(platformAccounts.accountId, account.accountId),
        ));

      await db.insert(platformAccounts).values({
        userId,
        platform: 'youtube',
        accountId: account.accountId,
        accountName: account.accountName,
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        tokenExpires: account.tokenExpires,
      });

      return reply.redirect(`${config.appUrl}/platforms?connected=youtube`);
    } catch (err: any) {
      console.error('Google OAuth error:', err.message);
      return reply.redirect(`${config.appUrl}/platforms?error=google_auth_failed`);
    }
  });

  // Disconnect platform
  app.delete('/api/platforms/:id', { preHandler: authGuard }, async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    const { id } = request.params as { id: string };

    const accountRows = await db.select().from(platformAccounts)
      .where(and(eq(platformAccounts.id, parseInt(id)), eq(platformAccounts.userId, user.userId)))
      .limit(1);

    if (accountRows.length === 0) return reply.status(404).send({ error: 'Account not found' });

    await db.delete(platformAccounts).where(eq(platformAccounts.id, parseInt(id)));
    return { success: true };
  });
}
