import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { platformAccounts } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { authGuard, JwtPayload, signToken } from '../middleware/auth.js';
import { getMetaAuthUrl, exchangeMetaCode } from '../services/oauth/meta.js';
import { getGoogleAuthUrl, exchangeGoogleCode } from '../services/oauth/google.js';

export async function platformRoutes(app: FastifyInstance) {
  // List connected platforms (auth required)
  app.get('/api/platforms', { preHandler: authGuard }, async (request) => {
    const user = (request as any).user as JwtPayload;
    return db.select().from(platformAccounts)
      .where(eq(platformAccounts.userId, user.userId))
      .all()
      .map(a => ({
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

    // Encode user info in state for the callback
    const state = Buffer.from(JSON.stringify({ userId: user.userId })).toString('base64');

    if (platform === 'facebook' || platform === 'instagram') {
      return { url: getMetaAuthUrl(state) };
    } else if (platform === 'youtube') {
      return { url: getGoogleAuthUrl(state) };
    }

    return reply.status(400).send({ error: 'Unknown platform' });
  });

  // Meta OAuth callback (no auth header - redirect from browser)
  app.get('/api/platforms/facebook/callback', async (request, reply) => {
    const { code, state } = request.query as { code: string; state: string };

    try {
      const { userId } = JSON.parse(Buffer.from(state, 'base64').toString());
      const accounts = await exchangeMetaCode(code);

      for (const account of accounts) {
        // Upsert: delete existing, then insert
        db.delete(platformAccounts)
          .where(and(
            eq(platformAccounts.userId, userId),
            eq(platformAccounts.platform, account.platform),
            eq(platformAccounts.accountId, account.accountId),
          )).run();

        db.insert(platformAccounts).values({
          userId,
          platform: account.platform,
          accountId: account.accountId,
          accountName: account.accountName,
          accessToken: account.accessToken,
          tokenExpires: account.tokenExpires,
        }).run();
      }

      return reply.redirect('http://localhost:5173/platforms?connected=facebook');
    } catch (err: any) {
      console.error('Meta OAuth error:', err.message);
      return reply.redirect('http://localhost:5173/platforms?error=meta_auth_failed');
    }
  });

  // Google OAuth callback
  app.get('/api/platforms/youtube/callback', async (request, reply) => {
    const { code, state } = request.query as { code: string; state: string };

    try {
      const { userId } = JSON.parse(Buffer.from(state, 'base64').toString());
      const account = await exchangeGoogleCode(code);

      // Upsert
      db.delete(platformAccounts)
        .where(and(
          eq(platformAccounts.userId, userId),
          eq(platformAccounts.platform, 'youtube'),
          eq(platformAccounts.accountId, account.accountId),
        )).run();

      db.insert(platformAccounts).values({
        userId,
        platform: 'youtube',
        accountId: account.accountId,
        accountName: account.accountName,
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        tokenExpires: account.tokenExpires,
      }).run();

      return reply.redirect('http://localhost:5173/platforms?connected=youtube');
    } catch (err: any) {
      console.error('Google OAuth error:', err.message);
      return reply.redirect('http://localhost:5173/platforms?error=google_auth_failed');
    }
  });

  // Disconnect platform
  app.delete('/api/platforms/:id', { preHandler: authGuard }, async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    const { id } = request.params as { id: string };

    const account = db.select().from(platformAccounts)
      .where(and(eq(platformAccounts.id, parseInt(id)), eq(platformAccounts.userId, user.userId)))
      .get();

    if (!account) return reply.status(404).send({ error: 'Account not found' });

    db.delete(platformAccounts).where(eq(platformAccounts.id, parseInt(id))).run();
    return { success: true };
  });
}
