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

// APP_URL may be a single origin or a comma-separated allow-list (e.g.
// "http://localhost:5173,https://joaomachado93.github.io"). Passing the
// raw string to `@fastify/cors` echoes it verbatim into the
// Access-Control-Allow-Origin header, which the browser rejects when
// commas are present. Parse to an array and use a function origin so
// each request gets a single matched origin echoed back.
function parseAllowedOrigins(appUrl: string): string[] {
  return appUrl.split(',').map(o => o.trim()).filter(Boolean);
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });

  const allowedOrigins = parseAllowedOrigins(config.appUrl);
  await app.register(cors, {
    origin: (origin, cb) => {
      // Same-origin / non-browser callers (curl, server-to-server) have no Origin header
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`Origin ${origin} not allowed by CORS`), false);
    },
    credentials: true,
  });

  await app.register(authRoutes);
  await app.register(mediaRoutes);
  await app.register(postRoutes);
  await app.register(platformRoutes);
  await app.register(dashboardRoutes);

  app.get('/api/health', () => ({ status: 'ok' }));

  return app;
}
