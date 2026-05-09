import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { runMigrations } from './db/index.js';
import { buildApp } from './app.js';
import { startScheduler } from './services/scheduler.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

await runMigrations();

const app = await buildApp({ logger: true });

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

startScheduler();

app.listen({ port: config.port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`Backend running on http://localhost:${config.port}`);
});
