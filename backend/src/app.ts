import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { authRoutes } from './routes/auth.js';
import { mediaRoutes } from './routes/media.js';
import { postRoutes } from './routes/posts.js';
import { platformRoutes } from './routes/platforms.js';
import { dashboardRoutes } from './routes/dashboard.js';

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });

  await app.register(cors, { origin: config.appUrl, credentials: true });

  await app.register(authRoutes);
  await app.register(mediaRoutes);
  await app.register(postRoutes);
  await app.register(platformRoutes);
  await app.register(dashboardRoutes);

  app.get('/api/health', () => ({ status: 'ok' }));

  return app;
}
