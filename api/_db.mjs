import { createClient } from '@supabase/supabase-js';

let client;

export function requireDatabase() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    const error = new Error('supabase database configuration missing');
    error.status = 500;
    throw error;
  }
  if (!client) {
    client = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return client;
}

export async function insertScoreRun({ runId, userId, startedAt }) {
  const { error } = await requireDatabase().from('score_runs').insert({
    run_id: runId,
    user_id: userId,
    started_at: startedAt
  });
  if (error) throw error;
}

export async function findScoreRun({ runId, userId }) {
  const { data, error } = await requireDatabase()
    .from('score_runs')
    .select('run_id, submitted_at')
    .eq('run_id', runId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function consumeScoreRun({ runId, userId, submittedAt }) {
  const { data, error } = await requireDatabase()
    .from('score_runs')
    .update({ submitted_at: submittedAt })
    .eq('run_id', runId)
    .eq('user_id', userId)
    .is('submitted_at', null)
    .select('run_id');
  if (error) throw error;
  return data || [];
}

export async function insertScore({ name, score, userId }) {
  const { error } = await requireDatabase().from('scores').insert({
    player_name: name,
    score,
    user_id: userId
  });
  if (error) throw error;
}

export async function getLeaderboard(limit = 10) {
  const { data, error } = await requireDatabase()
    .from('scores')
    .select('player_name, score, created_at')
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((row) => ({ name: String(row.player_name || '').slice(0, 10), score: Number(row.score) || 0 }));
}

export async function getAdminSnapshot() {
  const db = requireDatabase();
  const [scores, scoreCount, runCount, submittedCount, topScore] = await Promise.all([
    db.from('scores').select('id, player_name, score, user_id, created_at').order('created_at', { ascending: false }).limit(100),
    db.from('scores').select('*', { count: 'exact', head: true }),
    db.from('score_runs').select('*', { count: 'exact', head: true }),
    db.from('score_runs').select('*', { count: 'exact', head: true }).not('submitted_at', 'is', null),
    db.from('scores').select('score').order('score', { ascending: false }).limit(1)
  ]);
  const failure = [scores, scoreCount, runCount, submittedCount, topScore].find((result) => result.error);
  if (failure) throw failure.error;
  return {
    scores: scores.data || [],
    stats: {
      scoreCount: scoreCount.count || 0,
      runCount: runCount.count || 0,
      submittedRunCount: submittedCount.count || 0,
      topScore: topScore.data?.[0]?.score || 0
    }
  };
}
