import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from '../db/schema.js';
import { signToken } from '../middleware/auth.js';

let pglite: PGlite;
let testDb: PgliteDatabase<typeof schema>;

export function getTestDb() {
  return testDb;
}

const SCHEMA_SQL = `
  CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
  );

  CREATE TABLE platform_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    platform TEXT NOT NULL,
    account_name TEXT,
    account_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now()
  );

  CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    caption TEXT,
    scheduled_at TIMESTAMP NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
  );

  CREATE TABLE post_platforms (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES posts(id),
    platform_account_id INTEGER NOT NULL REFERENCES platform_accounts(id),
    status TEXT NOT NULL DEFAULT 'pending',
    platform_post_id TEXT,
    error_message TEXT,
    published_at TIMESTAMP
  );

  CREATE TABLE media (
    id SERIAL PRIMARY KEY,
    post_id INTEGER REFERENCES posts(id),
    original_key TEXT NOT NULL,
    watermarked_key TEXT,
    media_type TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER,
    sort_order INTEGER DEFAULT 0,
    processing_status TEXT DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT now()
  );

  CREATE TABLE publish_logs (
    id SERIAL PRIMARY KEY,
    post_id INTEGER REFERENCES posts(id),
    platform TEXT,
    level TEXT DEFAULT 'info',
    message TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now()
  );
`;

export async function setupTestDb() {
  pglite = new PGlite();
  await pglite.exec(SCHEMA_SQL);
  testDb = drizzle(pglite, { schema });
  return testDb;
}

export async function teardownTestDb() {
  if (pglite) await pglite.close();
}

export function getAuthToken(userId: number, email: string) {
  return signToken({ userId, email });
}
