import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { config } from '../config.js';
import * as schema from './schema.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mutable, swappable backing store. Tests call setDb(testPgliteDb).
// Production calls connectDb() which initializes pg.Pool + drizzle.
let _db: NodePgDatabase<typeof schema> | null = null;
let _pool: pg.Pool | null = null;

export function setDb(d: any): void {
  _db = d;
}

export function getPool(): pg.Pool | null {
  return _pool;
}

export function connectDb(): void {
  if (_db) return;
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  const usesSsl = !/localhost|127\.0\.0\.1/.test(config.databaseUrl);
  _pool = new pg.Pool({
    connectionString: config.databaseUrl,
    ssl: usesSsl ? { rejectUnauthorized: false } : false,
  });
  _db = drizzle(_pool, { schema });
}

// Proxy that delegates every property access to the active backing db.
// This lets us swap implementations (real pg pool ↔ pglite test instance)
// without route files needing to import a getter or be re-bound.
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop, _receiver) {
    if (!_db) {
      throw new Error('db not initialized — call connectDb() (prod) or setDb(testDb) (tests)');
    }
    const v = (_db as any)[prop];
    return typeof v === 'function' ? v.bind(_db) : v;
  },
});

// Back-compat: routes that imported `pool` directly. Returns null until connectDb runs.
// Currently no callers, but kept for parity with the previous export shape.
export const pool = new Proxy({} as pg.Pool, {
  get(_target, prop, _receiver) {
    if (!_pool) throw new Error('pool not initialized — call connectDb() first');
    const v = (_pool as any)[prop];
    return typeof v === 'function' ? v.bind(_pool) : v;
  },
});

export async function runMigrations(): Promise<void> {
  connectDb();
  try {
    await migrate(db, { migrationsFolder: resolve(__dirname, './migrations') });
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}
