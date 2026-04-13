import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { config } from '../config.js';
import * as schema from './schema.js';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure data directory exists
mkdirSync(dirname(config.paths.db), { recursive: true });

const sqlite = new Database(config.paths.db);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

// Auto-run migrations on startup
try {
  migrate(db, { migrationsFolder: resolve(__dirname, './migrations') });
} catch (err) {
  console.error('Migration failed:', err);
  process.exit(1);
}
