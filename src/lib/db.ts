import 'server-only';
import { Pool, type PoolClient } from 'pg';

const state = globalThis as typeof globalThis & { unuviaPool?: Pool };
export function getPool() {
  if (!process.env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL is required.');
  if (!state.unuviaPool) {
    state.unuviaPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 8,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });
    state.unuviaPool.on('error', () => console.error('Database connection interrupted.'));
  }
  return state.unuviaPool;
}
export async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
