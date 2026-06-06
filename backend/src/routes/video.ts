——import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { platformAccounts } from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { authGuard, JwtPayload } from '../middleware/auth.js';
import { getTikTokAuthUrl, exchangeTikTokCode } from '../services/oauth/tiktok.js';
import { getGoogleAuthUrl } from '../services/oauth/google.js';
import { config } from '../config.js';

const VIDEO_PLATFORMS = ['youtube', 'tiktok'] as const;

function signState(userId: number) {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: '15m' });
}

function verifyState(state: string): { userId: number } {
  const p = jwt.verify(state, config.jwtSecret) as { userId: number };
  if (typeof p.userId !== 'number') throw new Error('Invalid OAuth state');
  return { userId: p.userId };
}

export async function videoRoutes(app: FastifyInstance) {
  // List YT + TikTok accounts only (isolation: FB/IG never returned here)
  app.get('/api/video/platforms', { preHandler: authGuard }, async (request) => {
    const user = (request as any).user as JwtPayload;
    const rows = await db.select().from(platformAccounts).where(and(
      eq(platformAccounts.userId, user.userId),
      inArray(platformAccounts.platform, [...VIDEO_PLATFORMS]),
    ));
    return rows.map(a => ({
      id: a.id, platform: a.platform, accountName: a.accountName,
      accountId: a.accountId, createdAt: a.createdAt,
    }));
  });

  app.get('/api/video/capabilities', { preHandler: authGuard }, async () => ({
    youtube: { configured: !!config.google.clientId && !!config.google.clientSecret },
    tiktok: { configured: !!(process.env.TIKTOK_CLIENT_KEY || '') && !!(process.env.TIKTOK_CLIENT_SECRET || '') },
  }));

  // YouTube auth-url passthrough (reuses google.ts — no Meta touched)
  app.get('/api/video/youtube/auth-url', { preHandler: authGuard }, async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    if (!config.google.clientId || !config.google.clientSecret) {
      return reply.status(503).send({ error: 'Google OAuth not configured' });
    }
    return { url: getGoogleAuthUrl(signState(user.userId)) };
  });

  // TikTok auth-url
  app.get('/api/video/tiktok/auth-url', { preHandler: authGuard }, async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    if (!process.env.TIKTOK_CLIENT_KEY || !process.env.TIKTOK_CLIENT_SECRET) {
      return reply.status(503).send({ error: 'TikTok OAuth not configured' });
    }
    return { url: getTikTokAuthUrl(signState(user.userId)) };
  });

  // TikTok callback
  app.get('/api/video/tiktok/callback', async (request, reply) => {
    const { code, state } = request.query as { code: string; state: string };
    try {
      const { userId } = verifyState(state);
      const account = await exchangeTikTokCode(code);

      await db.delete(platformAccounts).where(and(
        eq(platformAccounts.userId, userId),
        eq(platformAccounts.platform, 'tiktok'),
        eq(platformAccounts.accountId, account.accountId),
      ));

      await db.insert(platformAccounts).values({
        userId,
        platform: 'tiktok',
        accountId: account.accountId,
        accountName: account.accountName,
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        tokenExpires: account.tokenExpires,
      });

      return reply.redirect(`${config.appUrl}/video/platforms?connected=tiktok`);
    } catch (err: any) {
      console.error('TikTok OAuth error:', err.message);
      return reply.redirect(`${config.appUrl}/video/platforms?error=tiktok_auth_failed`);
    }
  });

  // Disconnect — scoped to video platforms only (defence in depth)
  app.delete('/api/video/platforms/:id', { preHandler: authGuard }, async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    const { id } = request.params as { id: string };
    const rows = await db.select().from(platformAccounts).where(and(
      eq(platformAccounts.id, parseInt(id, 10)),
      eq(platformAccounts.userId, user.userId),
      inArray(platformAccounts.platform, [...VIDEO_PLATFORMS]),
    )).limit(1);
    if (rows.length === 0) return reply.status(404).send({ error: 'Account not found' });
    await db.delete(platformAccounts).where(eq(platformAccounts.id, parseInt(id, 10)));
    return { success: true };
  });
}
