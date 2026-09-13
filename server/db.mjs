import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || 'postgres://sky:sky@localhost:5432/sky',
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 5_000),
  query_timeout: Number(process.env.DB_QUERY_TIMEOUT_MS || 6_000),
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function withTransaction(work, userId = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    // Policies in 002_security_hardening.sql read this transaction-local setting.
    // set_config(..., true) prevents identity context leaking across pooled connections.
    if (userId) await client.query("SELECT set_config('app.user_id', $1, true)", [String(userId)]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDb() { await pool.end(); }

export function dbErrorStatus(error) {
  if (error?.code === '57014' || error?.code === '57000') return 503;
  if (error?.code === '23505') return 409;
  return 500;
}
