import Fastify, { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';
import { authRoutes } from '../routes/auth.js';
import { postRoutes } from '../routes/posts.js';
import { dashboardRoutes } from '../routes/dashboard.js';
import { signToken } from '../middleware/auth.js';

// In-memory test database
let testDb: ReturnType<typeof drizzle>;
let testSqlite: Database.Database;

export function getTestDb() {
  return testDb;
}

export function setupTestDb() {
  testSqlite = new Database(':memory:');
  testSqlite.pragma('journal_mode = WAL');
  testSqlite.pragma('foreign_keys = ON');

  // Create tables
  testSqlite.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE platform_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      platform TEXT NOT NULL CHECK(platform IN ('facebook', 'instagram', 'youtube')),
      account_name TEXT,
      account_id TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_expires TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      caption TEXT,
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'processing', 'published', 'partial', 'failed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE post_platforms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES posts(id),
      platform_account_id INTEGER NOT NULL REFERENCES platform_accounts(id),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'publishing', 'published', 'failed')),
      platform_post_id TEXT,
      error_message TEXT,
      published_at TEXT
    );

    CREATE TABLE media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER REFERENCES posts(id),
      original_path TEXT NOT NULL,
      watermarked_path TEXT,
      media_type TEXT NOT NULL CHECK(media_type IN ('image', 'video')),
      mime_type TEXT NOT NULL,
      file_size INTEGER,
      sort_order INTEGER DEFAULT 0,
      processing_status TEXT DEFAULT 'pending' CHECK(processing_status IN ('pending', 'processing', 'done', 'failed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE publish_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER REFERENCES posts(id),
      platform TEXT,
      level TEXT DEFAULT 'info',
      message TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  testDb = drizzle(testSqlite, { schema });
  return testDb;
}

export function teardownTestDb() {
  testSqlite?.close();
}

export function getAuthToken(userId: number, email: string) {
  return signToken({ userId, email });
}

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Mock the db module before registering routes
  await app.register(authRoutes);
  await app.register(postRoutes);
  await app.register(dashboardRoutes);

  return app;
}
