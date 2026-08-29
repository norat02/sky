import { authenticate, json, requireAdmin } from './_security.mjs';

const SCORE_COLUMNS = 'id,player_name,score,user_id,created_at';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  try {
    const session = await authenticate(req);
    if (!session) return json(res, 401, { error: 'unauthorized' });
    requireAdmin(session);

    const [scoresResult, scoreCountResult, runsResult, submittedResult, topResult] = await Promise.all([
      session.admin
        .from('scores')
        .select(SCORE_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(100),
      session.admin
        .from('scores')
        .select('id', { count: 'exact', head: true }),
      session.admin
        .from('score_runs')
        .select('run_id', { count: 'exact', head: true }),
      session.admin
        .from('score_runs')
        .select('run_id', { count: 'exact', head: true })
        .not('submitted_at', 'is', null),
      session.admin
        .from('scores')
        .select('score')
        .order('score', { ascending: false })
        .limit(1)
    ]);

    const failed = [scoresResult, scoreCountResult, runsResult, submittedResult, topResult].find((result) => result.error);
    if (failed) return json(res, 500, { error: 'admin_data_query_failed' });

    return json(res, 200, {
      generatedAt: new Date().toISOString(),
      stats: {
        scoreCount: scoreCountResult.count || 0,
        runCount: runsResult.count || 0,
        submittedRunCount: submittedResult.count || 0,
        topScore: topResult.data?.[0]?.score || 0
      },
      scores: scoresResult.data || []
    });
  } catch (error) {
    return json(res, error.status || 500, {
      error: error.status === 403 ? 'forbidden' : error.status === 500 ? 'server_not_configured' : 'admin_request_failed'
    });
  }
}
