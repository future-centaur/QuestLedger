import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from '@neondatabase/serverless';
import { databaseUrl } from './client';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

const LOCK = 4815162342;
const dir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

let pending: Promise<void> | undefined;

/** Apply any migrations that are not recorded yet. Concurrent callers wait on one Postgres lock. */
export function ensureMigrated(): Promise<void> {
  if (!pending) pending = runMigrations().catch((error) => {
    pending = undefined;
    throw error;
  });
  return pending;
}

function statements(sql: string): string[] {
  return sql
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.split('\n').some((line) => line.trim() && !line.trim().startsWith('--')));
}

async function runMigrations(): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl() });
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const files = readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
    for (const file of files) {
      const id = file.replace(/\.sql$/, '');
      const done = await client.query('SELECT 1 FROM schema_migrations WHERE id = $1', [id]);
      if (done.rowCount) continue;
      const sql = readFileSync(join(dir, file), 'utf8');
      await applyFile(client, id, sql);
      console.log(`Applied migration ${id}`);
    }
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK]);
    } catch {
      /* connection already closed */
    }
    client.release();
    await pool.end();
  }
}

async function applyFile(client: PoolClient, id: string, sql: string): Promise<void> {
  await client.query('BEGIN');
  try {
    for (const statement of statements(sql)) await client.query(statement);
    await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [id]);
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* the transaction is already aborted */
    }
    throw error;
  }
}
