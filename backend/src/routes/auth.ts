import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { signToken } from '../middleware/auth.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    if (!email || !password || password.length < 6) {
      return reply.status(400).send({ error: 'Email and password (min 6 chars) required' });
    }

    const existing = db.select().from(users).where(eq(users.email, email)).get();
    if (existing) {
      return reply.status(409).send({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = db.insert(users).values({ email, passwordHash }).returning().get();

    const token = signToken({ userId: result.id, email: result.email });
    return { token, user: { id: result.id, email: result.email } };
  });

  app.post('/api/auth/login', async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password required' });
    }

    const user = db.select().from(users).where(eq(users.email, email)).get();
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = signToken({ userId: user.id, email: user.email });
    return { token, user: { id: user.id, email: user.email } };
  });
}
