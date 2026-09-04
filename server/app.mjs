import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool, withTransaction } from './db.mjs';
import { hashPassword, verifyPassword, issueToken, requireAuth, requireRole } from './auth.mjs';
import { getJson, setJson, rateLimit } from './cache.mjs';

export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '64kb' }));

const credentials = z.object({ email: z.string().email().max(254), password: z.string().min(8).max(128) });
const nameSchema = z.string().trim().min(1).max(32).regex(/^[\p{L}\p{N} _-]+$/u);
const scoreSchema = z.object({ runId: z.string().uuid(), playerName: nameSchema, score: z.number().int().min(0).max(100000) });

async function guardRate(req, res, next) {
  const result = await rateLimit(`${req.ip}:${req.path}`, Number(process.env.RATE_LIMIT || 60), 60);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  return result.allowed ? next() : res.status(429).json({ error: 'rate_limited' });
}
app.use('/api', guardRate);

app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', service: 'sky-bird-api' }); }
  catch { res.status(503).json({ status: 'degraded', service: 'sky-bird-api' }); }
});

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { email, password } = credentials.parse(req.body);
    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query('INSERT INTO users(email, password_hash) VALUES ($1, $2) RETURNING id, email, role', [email.toLowerCase(), passwordHash]);
    const user = rows[0];
    res.status(201).json({ user, token: issueToken(user) });
  } catch (error) { if (error.code === '23505') return res.status(409).json({ error: 'email_already_exists' }); next(error); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password } = credentials.parse(req.body);
    const { rows } = await pool.query('SELECT id, email, role, password_hash FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!rows[0] || !(await verifyPassword(password, rows[0].password_hash))) return res.status(401).json({ error: 'invalid_credentials' });
    const { password_hash: _, ...user } = rows[0];
    res.json({ user, token: issueToken(user) });
  } catch (error) { next(error); }
});

app.get('/api/leaderboard', async (_req, res, next) => {
  try {
    const key = 'leaderboard:top:10';
    const cached = await getJson(key);
    if (cached) return res.json({ ...cached, cache: 'hit' });
    const { rows } = await pool.query('SELECT player_name AS "playerName", score, created_at AS "createdAt" FROM scores ORDER BY score DESC, created_at ASC, id ASC LIMIT 10');
    const response = { rows };
    await setJson(key, response, 15);
    res.json({ ...response, cache: 'miss' });
  } catch (error) { next(error); }
});

app.post('/api/runs', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('INSERT INTO game_runs(user_id) VALUES ($1) RETURNING id, status, started_at AS "startedAt", version', [req.user.sub]);
    res.status(201).json({ run: rows[0] });
  } catch (error) { next(error); }
});

app.post('/api/runs/:runId/score', requireAuth, async (req, res, next) => {
  const key = req.get('Idempotency-Key');
  if (!key || key.length > 128) return res.status(400).json({ error: 'idempotency_key_required' });
  try {
    const input = scoreSchema.parse({ ...req.body, runId: req.params.runId });
    const requestHash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const result = await withTransaction(async (client) => {
      const existing = await client.query('SELECT request_hash, status_code, response FROM idempotency_keys WHERE user_id = $1 AND key = $2 FOR UPDATE', [req.user.sub, key]);
      if (existing.rows[0]) {
        if (existing.rows[0].request_hash !== requestHash) { const error = new Error('idempotency_key_reused'); error.status = 409; throw error; }
        return { replay: true, statusCode: existing.rows[0].status_code, response: existing.rows[0].response };
      }
      await client.query('INSERT INTO idempotency_keys(user_id, key, request_hash) VALUES ($1, $2, $3)', [req.user.sub, key, requestHash]);
      const run = await client.query('SELECT id, status, version FROM game_runs WHERE id = $1 AND user_id = $2 FOR UPDATE', [input.runId, req.user.sub]);
      if (!run.rows[0] || run.rows[0].status !== 'started') { const error = new Error('run_not_available'); error.status = 409; throw error; }
      const updated = await client.query('UPDATE game_runs SET status = \'submitted\', score = $1, version = version + 1, submitted_at = now() WHERE id = $2 AND version = $3 RETURNING id', [input.score, input.runId, run.rows[0].version]);
      if (updated.rowCount !== 1) { const error = new Error('concurrent_run_update'); error.status = 409; throw error; }
      await client.query('INSERT INTO scores(run_id, user_id, player_name, score) VALUES ($1, $2, $3, $4)', [input.runId, req.user.sub, input.playerName, input.score]);
      await client.query('INSERT INTO outbox_events(event_type, aggregate_id, payload) VALUES ($1, $2, $3)', ['score.submitted', input.runId, JSON.stringify({ runId: input.runId, userId: req.user.sub, score: input.score })]);
      const response = { accepted: true, runId: input.runId, score: input.score };
      await client.query('UPDATE idempotency_keys SET status_code = 201, response = $1 WHERE user_id = $2 AND key = $3', [JSON.stringify(response), req.user.sub, key]);
      return { replay: false, statusCode: 201, response };
    });
    if (!result.replay) await setJson('leaderboard:top:10', null, 1);
    res.status(result.statusCode).json({ ...result.response, idempotentReplay: result.replay });
  } catch (error) { next(error); }
});

app.get('/api/admin/stats', requireAuth, requireRole('admin'), async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM game_runs) AS runs, (SELECT count(*) FROM scores) AS scores');
    res.json({ stats: rows[0] });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  const status = error.status || (error instanceof z.ZodError ? 400 : 500);
  res.status(status).json({ error: error instanceof z.ZodError ? 'validation_error' : error.message || 'internal_error' });
});
