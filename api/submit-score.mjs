import { authenticate, json, verifyRunTicket } from './_security.mjs';

const rateWindow = globalThis.__scoreRateWindow || (globalThis.__scoreRateWindow = new Map());

export function validName(value) {
  return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 10 && !/[<>]/.test(value);
}

export function validateScorePayload(body) {
  const value = body || {};
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const score = value.score;
  if (!validName(name) || !Number.isSafeInteger(score) || score < 0 || score > 100000) return null;
  return { name, score, ticket: value.ticket };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  try {
    const session = await authenticate(req);
    if (!session) return json(res, 401, { error: 'unauthorized' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const payload = validateScorePayload(body);
    const name = payload?.name;
    const score = payload?.score;
    const ticket = payload?.ticket;
    if (!payload) return json(res, 400, { error: 'invalid_score_payload' });

    const run = verifyRunTicket(ticket, session.user.id);
    if (!run) return json(res, 409, { error: 'invalid_or_expired_run' });

    const now = Date.now();
    const rate = rateWindow.get(session.user.id) || { count: 0, resetAt: now + 60_000 };
    if (rate.resetAt <= now) { rate.count = 0; rate.resetAt = now + 60_000; }
    if (rate.count >= 10) return json(res, 429, { error: 'too_many_submissions' });
    rate.count += 1;
    rateWindow.set(session.user.id, rate);

    const elapsedSeconds = Math.max(1, (now - run.startedAt) / 1000);
    const maxPlausibleScore = Math.min(100000, Math.floor(elapsedSeconds * 25) + 5);
    if (score > maxPlausibleScore) return json(res, 422, { error: 'score_rate_exceeded' });

    const existing = await session.db`
      SELECT run_id, submitted_at
      FROM score_runs
      WHERE run_id = ${run.runId} AND user_id = ${session.user.id}
      LIMIT 1
    `;
    if (!existing[0] || existing[0].submitted_at) return json(res, 409, { error: 'run_already_used' });

    const lockedRows = await session.db`
      UPDATE score_runs
      SET submitted_at = ${new Date(now)}
      WHERE run_id = ${run.runId}
        AND user_id = ${session.user.id}
        AND submitted_at IS NULL
      RETURNING run_id
    `;
    if (lockedRows.length !== 1) return json(res, 409, { error: 'run_already_used' });

    await session.db`
      INSERT INTO scores (player_name, score, user_id)
      VALUES (${name}, ${score}, ${session.user.id})
    `;

    const rows = await session.db`
      SELECT player_name, score, created_at
      FROM scores
      ORDER BY score DESC, created_at ASC
      LIMIT 10
    `;
    return json(res, 200, { rows: rows.map((row) => ({ name: row.player_name, score: row.score })) });
  } catch (error) {
    return json(res, error instanceof SyntaxError ? 400 : 500, { error: error instanceof SyntaxError ? 'invalid_json' : 'request_failed' });
  }
}
