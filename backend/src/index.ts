import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { authRoutes } from './routes/auth.js';
import { mediaRoutes } from './routes/media.js';
import { postRoutes } from './routes/posts.js';
import { platformRoutes } from './routes/platforms.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { startScheduler } from './services/scheduler.js';
import { mkdirSync } from 'fs';

const app = Fastify({ logger: true });

await app.register(cors, { origin: 'http://localhost:5173', credentials: true });

// Serve uploaded files
mkdirSync(config.paths.uploads, { recursive: true });
await app.register(fastifyStatic, {
  root: config.paths.uploads,
  prefix: '/uploads/',
  decorateReply: false,
});

// Routes
await app.register(authRoutes);
await app.register(mediaRoutes);
await app.register(postRoutes);
await app.register(platformRoutes);
await app.register(dashboardRoutes);

// Health check
app.get('/api/health', () => ({ status: 'ok' }));

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
