import { AsyncLocalStorage } from 'node:async_hooks';
import { neonConfig, Pool, type PoolClient } from '@neondatabase/serverless';
import ws from 'ws';

if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

const clients = new AsyncLocalStorage<PoolClient>();
let pool: Pool | undefined;

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return url;
}

function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: databaseUrl() });
  return pool;
}

/** The request transaction, or the pool when none is open. */
export function db() {
  return clients.getStore() ?? getPool();
}

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await db().query(text, params);
  return result.rows as T[];
}

export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await clients.run(client, fn);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* the connection is already unusable */
    }
    throw error;
  } finally {
    client.release();
  }
}
