import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

function secureConnectionString(connectionString: string) {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get('sslmode');
  if (sslMode && ['prefer', 'require', 'verify-ca'].includes(sslMode)) {
    url.searchParams.set('sslmode', 'verify-full');
  }
  return url.toString();
}

export const pool = new Pool({
  connectionString: secureConnectionString(config.DATABASE_URL),
  options: `-c timezone=${config.APP_TIMEZONE}`,
  max: 12,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error', error));

export async function initializeDatabase() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.resolve(currentDir, '../sql/schema.sql');
  const schema = await readFile(schemaPath, 'utf8');
  await pool.query(schema);
}
