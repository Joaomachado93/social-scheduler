import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { authRoutes } from './routes/auth.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: 'http://localhost:5173', credentials: true });

// Routes
await app.register(authRoutes);

// Health check
app.get('/api/health', () => ({ status: 'ok' }));

// Start
app.listen({ port: config.port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`Backend running on http://localhost:${config.port}`);
});
