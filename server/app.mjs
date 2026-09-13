import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import { pool, withTransaction } from './db.mjs';
import { hashPassword, verifyPassword, issueToken, requireAuth, requireRole, hashRequest, ttlSeconds } from './auth.mjs';
import { getJson, setJson, rateLimit } from './cache.mjs';
import { requestId, versionHeaders, validateSession, noStore, encodeCursor, decodeCursor } from './security.mjs';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));
app.use(helmet({ contentSecurityPolicy: false }));
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map((x) => x.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false, methods: ['GET', 'POST'], allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-ID'] }));
app.use(express.json({ limit: '64kb', strict: true }));
app.use(requestId);

const credentials = z.object({ email: z.string().email().max(254), password: z.string().min(12).max(128) }).strict();
const nameSchema = z.string().trim().min(1).max(32).regex(/^[\p{L}\p{N} _-]+$/u);
const scoreSchema = z.object({ playerName: nameSchema, score: z.number().int().min(0).max(100000) }).strict();
const paginationSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(10), cursor: z.string().max(512).optional() });

async function guardRate(req, res, next) {
  const identity = req.user?.sub || req.ip;
  const result = await rateLimit(`${identity}:${req.method}:${req.path}`, Number(process.env.RATE_LIMIT || 60), 60);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  if (!result.allowed) return res.status(429).json({ error: 'rate_limited', retryAfterSeconds: 60 });
  next();
}
app.use('/api', guardRate);

app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', service: 'sky-bird-api', version: 'v1' }); }
  catch { res.status(503).json({ status: 'degraded', service: 'sky-bird-api' }); }
});

const api = express.Router();
api.use(versionHeaders('v1'));

api.post('/auth/register', noStore, async (req, res, next) => {
  try {
    const { email, password } = credentials.parse(req.body);
    const result = await withTransaction(async (client) => {
      const passwordHash = await hashPassword(password);
      const { rows } = await client.query('INSERT INTO users(email, password_hash) VALUES ($1, $2) RETURNING id, email, role', [email.toLowerCase(), passwordHash]);
      const user = rows[0];
      const token = issueToken(user);
      const parsed = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      await client.query('INSERT INTO auth_sessions(user_id, jti, expires_at) VALUES ($1, $2, to_timestamp($3))', [user.id, parsed.jti, parsed.exp]);
      return { user, token, expiresIn: ttlSeconds };
    });
    res.status(201).json(result);
  } catch (error) { if (error.code === '23505') return res.status(409).json({ error: 'email_already_exists' }); next(error); }
});

api.post('/auth/login', noStore, async (req, res, next) => {
  try {
    const { email, password } = credentials.parse(req.body);
    const { rows } = await pool.query('SELECT id, email, role, password_hash FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!rows[0] || !(await verifyPassword(password, rows[0].password_hash))) return res.status(401).json({ error: 'invalid_credentials' });
    const { password_hash: _, ...user } = rows[0];
    const token = issueToken(user);
    const parsed = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    await pool.query('INSERT INTO auth_sessions(user_id, jti, expires_at) VALUES ($1, $2, to_timestamp($3))', [user.id, parsed.jti, parsed.exp]);
    res.json({ user, token, expiresIn: ttlSeconds });
  } catch (error) { next(error); }
});

api.post('/auth/logout', requireAuth, validateSession, noStore, async (req, res, next) => {
  try { await pool.query('UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND jti = $2', [req.user.sub, req.user.jti]); res.status(204).end(); }
  catch (error) { next(error); }
});

api.get('/leaderboard', async (req, res, next) => {
  try {
    const { limit, cursor: rawCursor } = paginationSchema.parse(req.query);
    const cursor = decodeCursor(rawCursor);
    if (rawCursor && !cursor) return res.status(400).json({ error: 'invalid_cursor' });
    const cacheKey = `leaderboard:v1:${limit}:${rawCursor || 'first'}`;
    const cached = await getJson(cacheKey);
    if (cached) return res.json({ ...cached, cache: 'hit' });
    const params = [limit + 1];
    let where = '';
    if (cursor) { params.push(cursor.score, cursor.createdAt, cursor.id); where = 'WHERE (score, created_at, id) < ($2, $3, $4)'; }
    const { rows } = await pool.query(`SELECT id, player_name AS "playerName", score, created_at AS "createdAt" FROM scores ${where} ORDER BY score DESC, created_at ASC, id ASC LIMIT $1`, params);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const response = { rows: page, pagination: { limit, hasMore, nextCursor: hasMore ? encodeCursor(page.at(-1)) : null } };
    await setJson(cacheKey, response, 15);
    res.json({ ...response, cache: 'miss' });
  } catch (error) { next(error); }
});

api.post('/runs', requireAuth, validateSession, async (req, res, next) => {
  try {
    const { rows } = await pool.query('INSERT INTO game_runs(user_id) VALUES ($1) RETURNING id, status, started_at AS "startedAt", version', [req.user.sub]);
    res.status(201).json({ run: rows[0] });
  } catch (error) { next(error); }
});

api.post('/runs/:runId/score', requireAuth, validateSession, async (req, res, next) => {
  const key = req.get('Idempotency-Key');
  if (!key || !/^[A-Za-z0-9._~-]{1,128}$/.test(key)) return res.status(400).json({ error: 'idempotency_key_required' });
  try {
    const input = scoreSchema.parse(req.body);
    const requestHash = hashRequest({ runId: req.params.runId, ...input });
    const result = await withTransaction(async (client) => {
      const existing = await client.query('SELECT request_hash, status_code, response FROM idempotency_keys WHERE user_id = $1 AND key = $2 FOR UPDATE', [req.user.sub, key]);
      if (existing.rows[0]) {
        if (existing.rows[0].request_hash !== requestHash) { const error = new Error('idempotency_key_reused'); error.status = 409; throw error; }
        return { replay: true, statusCode: existing.rows[0].status_code, response: existing.rows[0].response };
      }
      await client.query('INSERT INTO idempotency_keys(user_id, key, request_hash) VALUES ($1, $2, $3)', [req.user.sub, key, requestHash]);
      const run = await client.query('SELECT id, status, version, started_at FROM game_runs WHERE id = $1 AND user_id = $2 FOR UPDATE', [req.params.runId, req.user.sub]);
      if (!run.rows[0] || run.rows[0].status !== 'started') { const error = new Error('run_not_available'); error.status = 409; throw error; }
      const elapsedSeconds = Math.max(1, (Date.now() - new Date(run.rows[0].started_at).getTime()) / 1000);
      const maxPlausibleScore = Math.min(100000, Math.floor(elapsedSeconds * Number(process.env.MAX_SCORE_PER_SECOND || 25)) + 5);
      if (input.score > maxPlausibleScore) { const error = new Error('score_validation_failed'); error.status = 422; throw error; }
      const updated = await client.query("UPDATE game_runs SET status = 'submitted', score = $1, version = version + 1, submitted_at = now() WHERE id = $2 AND version = $3 AND status = 'started' RETURNING id", [input.score, req.params.runId, run.rows[0].version]);
      if (updated.rowCount !== 1) { const error = new Error('replay_detected'); error.status = 409; throw error; }
      await client.query('INSERT INTO scores(run_id, user_id, player_name, score) VALUES ($1, $2, $3, $4)', [req.params.runId, req.user.sub, input.playerName, input.score]);
      await client.query('INSERT INTO outbox_events(event_type, aggregate_id, payload) VALUES ($1, $2, $3)', ['score.submitted', req.params.runId, JSON.stringify({ runId: req.params.runId, userId: req.user.sub, score: input.score })]);
      const response = { accepted: true, runId: req.params.runId, score: input.score };
      await client.query('UPDATE idempotency_keys SET status_code = 201, response = $1 WHERE user_id = $2 AND key = $3', [JSON.stringify(response), req.user.sub, key]);
      return { replay: false, statusCode: 201, response };
    });
    if (!result.replay) await setJson('leaderboard:v1:10:first', null, 1);
    res.status(result.statusCode).json({ ...result.response, idempotentReplay: result.replay });
  } catch (error) { next(error); }
});

api.get('/admin/stats', requireAuth, validateSession, requireRole('admin'), async (_req, res, next) => {
  try { const { rows } = await pool.query('SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM game_runs) AS runs, (SELECT count(*) FROM scores) AS scores'); res.json({ stats: rows[0] }); }
  catch (error) { next(error); }
});

app.use('/api/v1', api);
// Backward-compatible alias during migration; new clients must use /api/v1.
app.use('/api', api);

app.use((error, req, res, _next) => {
  const status = error.status || (error instanceof z.ZodError ? 400 : 500);
  if (status >= 500) console.error(JSON.stringify({ event: 'api_error', requestId: req.requestId, error: error.message, stack: error.stack }));
  res.status(status).json({ error: error instanceof z.ZodError ? 'validation_error' : status === 500 ? 'internal_error' : error.message });
});
