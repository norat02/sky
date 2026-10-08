-- Rolling 24-hour leaderboard support.
-- Scores are retained for history; the API filters the ranking window and never deletes rows.
CREATE INDEX IF NOT EXISTS scores_leaderboard_24h_idx
  ON public.scores (created_at DESC, score DESC, id ASC);
