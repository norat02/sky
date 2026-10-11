import { readFileSync } from 'node:fs';

const files = {
  profiles: 'server/migrations/004_player_profiles.sql',
  economy: 'server/migrations/005_economy_transactions.sql',
  supabaseSchema: 'supabase/schema.sql',
};
const sources = Object.fromEntries(Object.entries(files).map(([name, path]) => [name, readFileSync(path, 'utf8')]));
const findings = [];
function requireMatch(source, pattern, code, message) { if (!pattern.test(source)) findings.push(`${code}: ${message}`); }
function requireNoMatch(source, pattern, code, message) { if (pattern.test(source)) findings.push(`${code}: ${message}`); }

const profiles = sources.profiles;
requireMatch(profiles, /ALTER TABLE player_profiles ENABLE ROW LEVEL SECURITY;/, 'F5-PROFILE-RLS', 'player_profiles must enable RLS');
requireMatch(profiles, /ALTER TABLE player_profiles FORCE ROW LEVEL SECURITY;/, 'F5-PROFILE-FORCE-RLS', 'player_profiles must force RLS');
requireMatch(profiles, /FOR SELECT USING \(user_id = auth\.uid\(\)\)/, 'F5-PROFILE-SELECT', 'profile SELECT must be restricted to auth.uid()');
requireMatch(profiles, /FOR INSERT WITH CHECK \(user_id = auth\.uid\(\)\)/, 'F5-PROFILE-INSERT', 'profile INSERT must be restricted to auth.uid()');
requireMatch(profiles, /FOR UPDATE USING \(user_id = auth\.uid\(\)\) WITH CHECK \(user_id = auth\.uid\(\)\)/, 'F5-PROFILE-UPDATE', 'profile UPDATE must be restricted to auth.uid()');
requireMatch(profiles, /REVOKE ALL ON player_profiles FROM anon;/, 'F5-PROFILE-ANON', 'anonymous role must have no profile privileges');
requireMatch(profiles, /GRANT SELECT, INSERT, UPDATE ON player_profiles TO authenticated;/, 'F5-PROFILE-AUTH', 'authenticated profile grant must be explicit');

const economy = sources.economy;
requireMatch(economy, /ALTER TABLE economy_transactions ENABLE ROW LEVEL SECURITY;/, 'F5-ECONOMY-RLS', 'economy_transactions must enable RLS');
requireMatch(economy, /ALTER TABLE economy_transactions FORCE ROW LEVEL SECURITY;/, 'F5-ECONOMY-FORCE-RLS', 'economy_transactions must force RLS');
requireMatch(economy, /REVOKE ALL ON economy_transactions FROM anon, authenticated;/, 'F5-ECONOMY-CLIENT-DENY', 'client roles must have no direct economy transaction privileges');
requireMatch(economy, /REVOKE ALL ON FUNCTION public\.complete_score_reward\(UUID,TEXT,INTEGER\) FROM PUBLIC;/, 'F5-REWARD-PUBLIC-DENY', 'reward RPC must revoke PUBLIC execute');
requireMatch(economy, /REVOKE ALL ON FUNCTION public\.unlock_character\(UUID,TEXT\) FROM PUBLIC;/, 'F5-UNLOCK-PUBLIC-DENY', 'unlock RPC must revoke PUBLIC execute');
requireMatch(economy, /GRANT EXECUTE ON FUNCTION public\.complete_score_reward\(UUID,TEXT,INTEGER\) TO service_role;/, 'F5-REWARD-SERVICE', 'reward RPC must be callable only by service_role');
requireMatch(economy, /GRANT EXECUTE ON FUNCTION public\.unlock_character\(UUID,TEXT\) TO service_role;/, 'F5-UNLOCK-SERVICE', 'unlock RPC must be callable only by service_role');
requireMatch(economy, /LANGUAGE plpgsql SECURITY DEFINER SET search_path = public/, 'F5-RPC-SEARCH-PATH', 'security-definer RPCs must pin search_path');
requireNoMatch(economy, /GRANT[^;]*ON FUNCTION[^;]*TO (?:PUBLIC|anon|authenticated)/i, 'F5-RPC-CLIENT-GRANT', 'economy RPC must not grant execute to public client roles');
requireNoMatch(economy, /GRANT (?:INSERT|UPDATE|DELETE|ALL)[^;]*\b(?:coins|best_score|flights|unlocked_characters)\b[^;]*TO authenticated/i, 'F5-ECONOMY-COLUMN-GRANT', 'authenticated role must not write server-owned economy columns');

const schema = sources.supabaseSchema;
for (const table of ['scores', 'score_runs']) {
  const tableBlock = schema.slice(schema.indexOf(`public.${table}`));
  requireMatch(tableBlock, new RegExp(`alter table public\\.${table} enable row level security;`, 'i'), `F5-${table.toUpperCase()}-RLS`, `${table} must enable RLS`);
  requireMatch(tableBlock, new RegExp(`revoke all on table public\\.${table} from anon, authenticated;`, 'i'), `F5-${table.toUpperCase()}-CLIENT-DENY`, `${table} must deny direct client table access`);
}
requireNoMatch(schema, /grant\s+(?:select|insert|update|delete|all)[^;]*on\s+table\s+public\.(?:scores|score_runs)[^;]*to\s+(?:anon|authenticated)/i, 'F5-SCHEMA-CLIENT-GRANT', 'client roles must not receive direct score table privileges');

if (findings.length) {
  console.error(`F-5 RLS/access-control audit failed (${findings.length} finding(s))`);
  for (const item of findings) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log('F-5 RLS/access-control audit: OK (private tables, grants, policies, and RPC boundaries verified)');
}
