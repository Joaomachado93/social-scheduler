import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { posts } from '../db/schema.js';
import { eq, desc, gte, lte, and, sql } from 'drizzle-orm';
import { authGuard, JwtPayload } from '../middleware/auth.js';

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authGuard);

  app.get('/api/dashboard/stats', async (request) => {
    const user = (request as any).user as JwtPayload;
    const all = db.select().from(posts).where(eq(posts.userId, user.userId)).all();

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
    return db.select().from(posts)
      .where(and(
        eq(posts.userId, user.userId),
        eq(posts.status, 'scheduled'),
      ))
      .orderBy(posts.scheduledAt)
      .limit(10)
      .all();
  });

  app.get('/api/dashboard/recent', async (request) => {
    const user = (request as any).user as JwtPayload;
    return db.select().from(posts)
      .where(eq(posts.userId, user.userId))
      .orderBy(desc(posts.updatedAt))
      .limit(10)
      .all();
  });

  app.get('/api/calendar', async (request) => {
    const user = (request as any).user as JwtPayload;
    const query = request.query as { month?: string; year?: string };
    const now = new Date();
    const year = parseInt(query.year || String(now.getFullYear()));
    const month = parseInt(query.month || String(now.getMonth() + 1));

    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const toDate = new Date(year, month, 0);
    const to = `${year}-${String(month).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}T23:59:59`;

    return db.select().from(posts)
      .where(and(
        eq(posts.userId, user.userId),
        gte(posts.scheduledAt, from),
        lte(posts.scheduledAt, to),
      ))
      .orderBy(posts.scheduledAt)
      .all();
  });
}
