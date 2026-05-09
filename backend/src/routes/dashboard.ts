import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { posts } from '../db/schema.js';
import { eq, desc, gte, lte, and } from 'drizzle-orm';
import { authGuard, JwtPayload } from '../middleware/auth.js';

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authGuard);

  app.get('/api/dashboard/stats', async (request) => {
    const user = (request as any).user as JwtPayload;
    const all = await db.select().from(posts).where(eq(posts.userId, user.userId));

    return {
      total: all.length,
      scheduled: all.filter(p => p.status === 'scheduled').length,
      published: all.filter(p => p.status === 'published').length,
      failed: all.filter(p => p.status === 'failed').length,
      partial: all.filter(p => p.status === 'partial').length,
      draft: all.filter(p => p.status === 'draft').length,
      processing: all.filter(p => p.status === 'processing').length,
    };
  });

  app.get('/api/dashboard/upcoming', async (request) => {
    const user = (request as any).user as JwtPayload;
    return await db.select().from(posts)
      .where(and(
        eq(posts.userId, user.userId),
        eq(posts.status, 'scheduled'),
        gte(posts.scheduledAt, new Date().toISOString()),
      ))
      .orderBy(posts.scheduledAt)
      .limit(10);
  });

  app.get('/api/dashboard/recent', async (request) => {
    const user = (request as any).user as JwtPayload;
    return await db.select().from(posts)
      .where(eq(posts.userId, user.userId))
      .orderBy(desc(posts.updatedAt))
      .limit(10);
  });

  app.get('/api/calendar', async (request) => {
    const user = (request as any).user as JwtPayload;
    const query = request.query as { month?: string; year?: string };
    const now = new Date();

    const yearRaw = parseInt(query.year ?? String(now.getFullYear()), 10);
    const monthRaw = parseInt(query.month ?? String(now.getMonth() + 1), 10);
    const year = Number.isInteger(yearRaw) ? yearRaw : now.getFullYear();
    const month = Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12
      ? monthRaw
      : now.getMonth() + 1;

    // Schema stores scheduledAt as `timestamp({ mode: 'string', withTimezone: false })`,
    // so values come back as ISO strings without trailing 'Z'. Build the bounds in
    // the same shape with full HH:MM:SS — both endpoints inclusive.
    const pad = (n: number) => String(n).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    const from = `${year}-${pad(month)}-01T00:00:00`;
    const to = `${year}-${pad(month)}-${pad(lastDay)}T23:59:59`;

    return await db.select().from(posts)
      .where(and(
        eq(posts.userId, user.userId),
        gte(posts.scheduledAt, from),
        lte(posts.scheduledAt, to),
      ))
      .orderBy(posts.scheduledAt);
  });
}
