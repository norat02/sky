import crypto from 'node:crypto';
import { pool } from './db.mjs';

export function requestId(req, res, next) {
  const id = req.get('X-Request-ID')?.slice(0, 100) || crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    console.info(JSON.stringify({ event: 'http_request', requestId: id, method: req.method, path: req.originalUrl, status: res.statusCode, durationMs: Math.round(durationMs * 100) / 100, userId: req.user?.sub || null }));
  });
  next();
}

export function versionHeaders(version = 'v1') {
  return (_req, res, next) => {
    res.setHeader('API-Version', version);
    res.setHeader('Deprecation', 'false');
    next();
  };
}

export async function validateSession(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT revoked_at, expires_at FROM auth_sessions WHERE user_id = $1 AND jti = $2', [req.user.sub, req.user.jti]);
    if (!rows[0] || rows[0].revoked_at || new Date(rows[0].expires_at).getTime() <= Date.now()) return res.status(401).json({ error: 'session_expired' });
    req.session = rows[0];
    next();
  } catch (error) { next(error); }
}

export function noStore(_req, res, next) { res.setHeader('Cache-Control', 'no-store'); next(); }

export function encodeCursor(row) {
  return Buffer.from(JSON.stringify({ score: row.score, createdAt: row.createdAt, id: row.id })).toString('base64url');
}

export function decodeCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    if (!Number.isInteger(parsed.score) || !Number.isInteger(parsed.id) || typeof parsed.createdAt !== 'string') return null;
    return parsed;
  } catch { return null; }
}
