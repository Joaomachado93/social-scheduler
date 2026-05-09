import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as schema from '../db/schema.js';
import { signToken } from '../middleware/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = resolve(__dirname, '../db/migrations');

let pglite: PGlite;
let testDb: PgliteDatabase<typeof schema>;

export function getTestDb() {
  return testDb;
}

export async function setupTestDb() {
  pglite = new PGlite();
  testDb = drizzle(pglite, { schema });
  await migrate(testDb, { migrationsFolder: MIGRATIONS_FOLDER });
  return testDb;
}

export async function teardownTestDb() {
  if (pglite) await pglite.close();
}

export function getAuthToken(userId: number, email: string) {
  return signToken({ userId, email });
}
