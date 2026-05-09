import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import type { Config } from 'drizzle-kit';

loadEnv({ path: resolve(__dirname, '../.env') });

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
} satisfies Config;
