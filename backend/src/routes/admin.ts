import { FastifyInstance } from 'fastify';
import { runInstagramAutoSync } from '../services/jobs/instagramAutoSync.js';

export async function adminRoutes(app: FastifyInstance) {
  // Manual trigger for the IG → YT+TikTok sync. Same logic as the 3am cron.
  // Protected by ADMIN_SECRET env var to avoid exposing on a public URL.
  app.post('/api/admin/run-ig-sync', async (request, reply) => {
    const secret = process.env.ADMIN_SECRET || '';
    if (!secret) return reply.status(503).send({ error: 'ADMIN_SECRET not configured' });

    const provided = (request.headers['x-admin-secret'] || '') as string;
    if (provided !== secret) return reply.status(401).send({ error: 'Unauthorized' });

    try {
      await runInstagramAutoSync();
      return { ok: true };
    } catch (err: any) {
      app.log.error({ err: err.message }, 'manual ig-sync failed');
      return reply.status(500).send({ ok: false, error: err.message });
    }
  });
}
