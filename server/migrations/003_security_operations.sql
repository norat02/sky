-- Operational security controls. Apply after 002_security_hardening.sql.

CREATE TABLE IF NOT EXISTS auth_login_attempts (
  key TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  locked_until TIMESTAMPTZ,
  last_failed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_login_attempts_lock_idx
  ON auth_login_attempts(locked_until) WHERE locked_until IS NOT NULL;

CREATE TABLE IF NOT EXISTS security_audit_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  request_id TEXT,
  ip_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_audit_events_type_time_idx
  ON security_audit_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_events_user_time_idx
  ON security_audit_events(user_id, created_at DESC);

ALTER TABLE auth_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_audit_events ENABLE ROW LEVEL SECURITY;

-- These tables are server-owned. A runtime role must receive only the exact
-- INSERT/SELECT/UPDATE rights required by the API; no client role receives access.
-- GRANT SELECT, INSERT, UPDATE, DELETE ON auth_login_attempts TO sky_api;
-- GRANT SELECT, INSERT ON security_audit_events TO sky_api;
-- GRANT USAGE, SELECT ON SEQUENCE security_audit_events_id_seq TO sky_api;

-- Maintenance should run from a trusted scheduler, never from a client request.
-- DELETE FROM auth_login_attempts WHERE updated_at < now() - interval '90 days';
-- DELETE FROM security_audit_events WHERE created_at < now() - interval '365 days';
