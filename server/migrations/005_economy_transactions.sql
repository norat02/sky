-- Server-authoritative economy operations. Never trust client coin totals or prices.
CREATE TABLE IF NOT EXISTS economy_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES player_profiles(user_id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN ('score_reward','character_unlock')),
  reference_id TEXT NOT NULL CHECK (char_length(reference_id) BETWEEN 1 AND 128),
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, operation, reference_id)
);
CREATE INDEX IF NOT EXISTS economy_transactions_user_created_idx ON economy_transactions(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.complete_score_reward(p_user_id UUID, p_reference_id TEXT, p_score INTEGER)
RETURNS TABLE(coins INTEGER, best_score INTEGER, flights INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE reward INTEGER := GREATEST(0, LEAST(1000000, FLOOR(GREATEST(0, p_score)::numeric / 10)::integer));
BEGIN
  INSERT INTO player_profiles(user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  PERFORM 1 FROM player_profiles WHERE user_id = p_user_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM economy_transactions WHERE user_id=p_user_id AND operation='score_reward' AND reference_id=p_reference_id) THEN
    UPDATE player_profiles SET coins=LEAST(1000000, coins+reward), best_score=GREATEST(best_score,p_score), flights=flights+1, updated_at=now() WHERE user_id=p_user_id;
    INSERT INTO economy_transactions(user_id,operation,reference_id,delta,balance_after,metadata)
      SELECT p_user_id,'score_reward',p_reference_id,reward,coins,jsonb_build_object('score',p_score) FROM player_profiles WHERE user_id=p_user_id;
  END IF;
  RETURN QUERY SELECT p.coins,p.best_score,p.flights FROM player_profiles p WHERE p.user_id=p_user_id;
END $$;

CREATE OR REPLACE FUNCTION public.unlock_character(p_user_id UUID, p_character TEXT)
RETURNS TABLE(coins INTEGER, unlocked_characters JSONB, charged INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cost INTEGER;
DECLARE next_unlocked JSONB;
BEGIN
  cost := CASE p_character WHEN 'swallow' THEN 30 WHEN 'crow' THEN 45 WHEN 'dove' THEN 60 WHEN 'swift' THEN 80 WHEN 'owl' THEN 100 WHEN 'hawk' THEN 120 WHEN 'crane' THEN 150 WHEN 'kingfisher' THEN 180 ELSE NULL END;
  IF cost IS NULL THEN RAISE EXCEPTION 'invalid_character'; END IF;
  INSERT INTO player_profiles(user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  PERFORM 1 FROM player_profiles WHERE user_id = p_user_id FOR UPDATE;
  SELECT p.unlocked_characters INTO next_unlocked FROM player_profiles p WHERE p.user_id=p_user_id;
  IF next_unlocked ? p_character THEN RETURN QUERY SELECT p.coins,p.unlocked_characters,0 FROM player_profiles p WHERE p.user_id=p_user_id; RETURN; END IF;
  IF (SELECT p.coins FROM player_profiles p WHERE p.user_id=p_user_id) < cost THEN RAISE EXCEPTION 'insufficient_coins'; END IF;
  UPDATE player_profiles SET coins=coins-cost, unlocked_characters=next_unlocked || to_jsonb(p_character), updated_at=now() WHERE user_id=p_user_id;
  INSERT INTO economy_transactions(user_id,operation,reference_id,delta,balance_after,metadata)
    SELECT p_user_id,'character_unlock',p_character,-cost,coins,jsonb_build_object('character',p_character,'cost',cost) FROM player_profiles WHERE user_id=p_user_id;
  RETURN QUERY SELECT p.coins,p.unlocked_characters,cost FROM player_profiles p WHERE p.user_id=p_user_id;
END $$;

REVOKE ALL ON FUNCTION public.complete_score_reward(UUID,TEXT,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unlock_character(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_score_reward(UUID,TEXT,INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.unlock_character(UUID,TEXT) TO service_role;
REVOKE ALL ON economy_transactions FROM anon, authenticated;

-- Authenticated clients may sync preferences only; coins, scores, flights and unlocks are server-owned.
REVOKE INSERT, UPDATE ON player_profiles FROM authenticated;
GRANT INSERT (user_id, display_name, selected_character, selected_map, language, volume, muted) ON player_profiles TO authenticated;
GRANT UPDATE (display_name, selected_character, selected_map, language, volume, muted) ON player_profiles TO authenticated;
