import { authenticate, json, requireAdmin } from './_security.mjs';

export function createAdminDataHandler({ authenticateFn = authenticate } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
    try {
      const session = await authenticateFn(req);
      if (!session) return json(res, 401, { error: 'unauthorized' });
      requireAdmin(session);

      const [scores, scoreCount, runCount, submittedCount, topScore] = await Promise.all([
        session.db`
          SELECT id, player_name, score, user_id, created_at
          FROM scores
          ORDER BY created_at DESC
          LIMIT 100
        `,
        session.db`SELECT count(*)::int AS count FROM scores`,
        session.db`SELECT count(*)::int AS count FROM score_runs`,
        session.db`SELECT count(*)::int AS count FROM score_runs WHERE submitted_at IS NOT NULL`,
        session.db`SELECT score FROM scores ORDER BY score DESC LIMIT 1`
      ]);

      return json(res, 200, {
        generatedAt: new Date().toISOString(),
        stats: {
          scoreCount: scoreCount[0]?.count || 0,
          runCount: runCount[0]?.count || 0,
          submittedRunCount: submittedCount[0]?.count || 0,
          topScore: topScore[0]?.score || 0
        },
        scores
      });
    } catch (error) {
      return json(res, error.status || 500, {
        error: error.status === 403 ? 'forbidden' : error.status === 500 ? 'server_not_configured' : 'admin_request_failed'
      });
    }
  };
}

export default createAdminDataHandler();
