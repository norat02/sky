import { neon } from '@neondatabase/serverless';

let sql;

export function requireDatabase() {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) {
    const error = new Error('database configuration missing');
    error.status = 500;
    throw error;
  }
  if (!sql) sql = neon(url);
  return sql;
}

export async function queryDatabase(query) {
  return requireDatabase()(query);
}
