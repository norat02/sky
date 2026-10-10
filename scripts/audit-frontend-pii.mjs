import { existsSync, readFileSync } from 'node:fs';

const files = [
  'index.html',
  'ui.js',
  'game.js',
  'player-sync.js',
  'env.js',
  'dist/index.html',
  'dist/ui.js',
  'dist/game.js',
  'dist/player-sync.js',
  'dist/env.js',
].filter(existsSync);
const findings = [];
function source(path) { return readFileSync(path, 'utf8'); }
function finding(code, message) { findings.push(`${code}: ${message}`); }
function requireMatch(value, pattern, code, message) { if (!pattern.test(value)) finding(code, message); }
function requireNoMatch(value, pattern, code, message) { if (pattern.test(value)) finding(code, message); }

const frontend = files.map((path) => ({ path, text: source(path) }));
const secretPattern = /SUPABASE_SERVICE_ROLE_KEY|SCORE_SIGNING_SECRET|JWT_SECRET|SMTP_PASSWORD|DATABASE_URL|BEGIN\s+(?:RSA|OPENSSH|EC)\s+PRIVATE KEY|sk-[A-Za-z0-9]{20,}/i;
for (const file of frontend) {
  requireNoMatch(file.text, secretPattern, 'F2-SECRET', `server secret or private key appears in frontend artifact: ${file.path}`);
}

const configSource = source('scripts/generate-config.mjs');
requireNoMatch(configSource, /SERVICE_ROLE|SCORE_SIGNING_SECRET|JWT_SECRET|SMTP_PASSWORD|DATABASE_URL/i, 'F2-CONFIG', 'build config exposes a server-only environment variable');

const leaderboardDb = source('api/_db.mjs');
requireMatch(leaderboardDb, /\.select\(['"]player_name,\s*score,\s*created_at['"]\)/, 'F2-LEADERBOARD-SELECT', 'public leaderboard must select only player_name, score, created_at');
requireMatch(leaderboardDb, /return \(data \|\| \[\]\)\.map\([\s\S]*?name:[\s\S]*?score:/, 'F2-LEADERBOARD-SHAPE', 'public leaderboard must allowlist name and score in its response');
requireNoMatch(leaderboardDb.slice(leaderboardDb.indexOf('export async function getLeaderboard'), leaderboardDb.indexOf('export async function getAdminSnapshot')), /email|user_id|user_metadata|app_metadata/i, 'F2-LEADERBOARD-PII', 'public leaderboard path contains a private user field');

const leaderboardHandler = source('api/leaderboard.mjs');
requireMatch(leaderboardHandler, /return res\.status\(200\)\.json\(\{ rows \}\)/, 'F2-PUBLIC-RESPONSE', 'public leaderboard endpoint response contract changed');

const sync = source('player-sync.js');
requireMatch(sync, /\.eq\(['"]user_id['"],\s*userId\)/, 'F2-PROFILE-SCOPE', 'profile read must be scoped to the authenticated user id');
if (/\.select\(['"]\*['"]\)/.test(sync)) finding('F2-PROFILE-WILDCARD', 'frontend profile sync uses select(*) instead of an explicit least-privilege column list');

const profiles = source('server/migrations/004_player_profiles.sql');
requireMatch(profiles, /ENABLE ROW LEVEL SECURITY/i, 'F2-RLS-ENABLED', 'player_profiles must enable RLS');
requireMatch(profiles, /FORCE ROW LEVEL SECURITY/i, 'F2-RLS-FORCED', 'player_profiles must force RLS');
requireMatch(profiles, /FOR SELECT USING \(user_id = auth\.uid\(\)\)/, 'F2-RLS-SELECT', 'profile SELECT policy must be self-only');
requireMatch(profiles, /FOR UPDATE USING \(user_id = auth\.uid\(\)\) WITH CHECK \(user_id = auth\.uid\(\)\)/, 'F2-RLS-UPDATE', 'profile UPDATE policy must be self-only');
requireNoMatch(profiles, /USING \(true\)/, 'F2-RLS-PUBLIC', 'private profile table contains a public allow policy');

const adminEndpoint = source('api/admin-data.mjs');
requireMatch(adminEndpoint, /requireAdmin\(session\)/, 'F2-ADMIN-AUTHZ', 'admin data endpoint must authorize on the server');

if (findings.length) {
  console.error(`F-2 frontend PII audit failed (${findings.length} finding(s))`);
  for (const item of findings) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log(`F-2 frontend PII audit: OK (${files.length} frontend artifacts checked)`);
}
