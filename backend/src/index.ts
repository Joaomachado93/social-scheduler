import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { runMigrations } from './db/index.js';
import { authRoutes } from './routes/auth.js';
import { mediaRoutes } from './routes/media.js';
import { postRoutes } from './routes/posts.js';
import { platformRoutes } from './routes/platforms.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { startScheduler } from './services/scheduler.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

await runMigrations();

const app = Fastify({ logger: true });

await app.register(cors, { origin: config.appUrl, credentials: true });

// Routes
await app.register(authRoutes);
await app.register(mediaRoutes);
await app.register(postRoutes);
await app.register(platformRoutes);
await app.register(dashboardRoutes);

// Health check
app.get('/api/health', () => ({ status: 'ok' }));

// In production, serve frontend build
if (config.nodeEnv === 'production') {
  const frontendDist = resolve(__dirname, '../../frontend/dist');
  await app.register(fastifyStatic, {
    root: frontendDist,
    prefix: '/',
  });

  const indexHtml = readFileSync(resolve(frontendDist, 'index.html'), 'utf-8');
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.status(404).send({ error: 'Not found' });
    }
    return reply.type('text/html').send(indexHtml);
  });
}

// Start scheduler
startScheduler();

// Start server
app.listen({ port: config.port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`Backend running on http://localhost:${config.port}`);
});
