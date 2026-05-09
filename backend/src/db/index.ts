import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { config } from '../config.js';
import * as schema from './schema.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const usesSsl = !/localhost|127\.0\.0\.1/.test(config.databaseUrl);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: usesSsl ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool, { schema });

export async function runMigrations() {
  try {
    await migrate(db, { migrationsFolder: resolve(__dirname, './migrations') });
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}
