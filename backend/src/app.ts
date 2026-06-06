import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { authRoutes } from './routes/auth.js';
import { mediaRoutes } from './routes/media.js';
import { postRoutes } from './routes/posts.js';
import { platformRoutes } from './routes/platforms.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { videoRoutes } from './routes/video.js';

export interface BuildAppOptions {
    logger?: boolean;
}

// APP_URL may be a single origin or a comma-separated allow-list, and may
// include a path (e.g. "https://joaomachado93.github.io/social-scheduler").
// For CORS we only need the *origin* (scheme + host + port), not the path.
// Extract the origin from each URL so CORS works regardless of whether
// APP_URL has a path suffix.
function parseAllowedOrigins(appUrl: string): string[] {
    return appUrl
      .split(',')
      .map(u => {
              try {
                        return new URL(u.trim()).origin;
              } catch {
                        return u.trim();
              }
      })
      .filter(Boolean);
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
    await app.register(videoRoutes);
    await app.register(dashboardRoutes);

  app.get('/api/health', () => ({ status: 'ok' }));

  return app;
}
