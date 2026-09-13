-- Sky Bird v2 security hardening. Apply after 001_sky_bird_v2.sql.
CREATE TABLE IF NOT EXISTS auth_sessions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jti UUID PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at) WHERE revoked_at IS NULL;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;

-- The API connects with a server-only role and sets app.user_id per transaction.
-- No client role receives direct table access. Keep service/owner credentials out of the app bundle.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_self' AND tablename = 'users') THEN
    CREATE POLICY users_self ON users FOR SELECT USING (id::text = current_setting('app.user_id', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'runs_self' AND tablename = 'game_runs') THEN
    CREATE POLICY runs_self ON game_runs USING (user_id::text = current_setting('app.user_id', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'scores_public_read' AND tablename = 'scores') THEN
    CREATE POLICY scores_public_read ON scores FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'scores_owner_write' AND tablename = 'scores') THEN
    CREATE POLICY scores_owner_write ON scores FOR INSERT WITH CHECK (user_id::text = current_setting('app.user_id', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'idempotency_self' AND tablename = 'idempotency_keys') THEN
    CREATE POLICY idempotency_self ON idempotency_keys USING (user_id::text = current_setting('app.user_id', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sessions_self' AND tablename = 'auth_sessions') THEN
    CREATE POLICY sessions_self ON auth_sessions USING (user_id::text = current_setting('app.user_id', true));
  END IF;
END $$;

-- Optional runtime role: set DATABASE_APP_ROLE and DATABASE_ADMIN_ROLE in deployment.
-- Run these statements with a database owner, replacing passwords from a secrets manager.
-- CREATE ROLE sky_api LOGIN PASSWORD 'managed-secret' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
-- GRANT USAGE ON SCHEMA public TO sky_api;
-- GRANT SELECT, INSERT, UPDATE ON users, game_runs, scores, idempotency_keys, auth_sessions TO sky_api;
-- GRANT INSERT, SELECT, UPDATE ON outbox_events TO sky_api;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sky_api;
-- ALTER TABLE users, game_runs, scores, idempotency_keys, outbox_events, auth_sessions FORCE ROW LEVEL SECURITY;

-- Remove expired sessions/idempotency records in a scheduled maintenance job.
-- Never run this DELETE from an untrusted client connection.
