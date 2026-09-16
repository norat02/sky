-- Cross-device player profile. The Supabase Auth user owns exactly one row.
CREATE TABLE IF NOT EXISTS player_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '' CHECK (char_length(display_name) <= 32),
  best_score INTEGER NOT NULL DEFAULT 0 CHECK (best_score BETWEEN 0 AND 100000),
  flights INTEGER NOT NULL DEFAULT 0 CHECK (flights BETWEEN 0 AND 100000000),
  coins INTEGER NOT NULL DEFAULT 0 CHECK (coins BETWEEN 0 AND 1000000),
  unlocked_characters JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_character TEXT NOT NULL DEFAULT 'tit',
  selected_map TEXT NOT NULL DEFAULT 'sakura',
  language TEXT NOT NULL DEFAULT 'vi',
  volume INTEGER NOT NULL DEFAULT 50 CHECK (volume BETWEEN 0 AND 100),
  muted BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE player_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS player_profiles_select_self ON player_profiles;
CREATE POLICY player_profiles_select_self ON player_profiles
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS player_profiles_insert_self ON player_profiles;
CREATE POLICY player_profiles_insert_self ON player_profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS player_profiles_update_self ON player_profiles;
CREATE POLICY player_profiles_update_self ON player_profiles
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

REVOKE ALL ON player_profiles FROM anon;
GRANT SELECT, INSERT, UPDATE ON player_profiles TO authenticated;
