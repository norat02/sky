import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAdminUser } from '../api/_security.mjs';
import { createAdminDataHandler } from '../api/admin-data.mjs';

const security = readFileSync('api/_security.mjs', 'utf8');
const adminEndpoint = readFileSync('api/admin-data.mjs', 'utf8');
const frontend = readFileSync('admin.html', 'utf8');
const findings = [];
process.env.ADMIN_EMAILS = 'admin@example.com';
process.env.ADMIN_USER_IDS = 'allowlisted';
function requireMatch(value, pattern, code, message) { if (!pattern.test(value)) findings.push(`${code}: ${message}`); }
function requireNoMatch(value, pattern, code, message) { if (pattern.test(value)) findings.push(`${code}: ${message}`); }

requireMatch(security, /export function isAdminUser\(user\)/, 'F3-ADMIN-FUNCTION', 'server must expose one admin authorization function');
requireMatch(security, /const userIds = envList\('ADMIN_USER_IDS'\)/, 'F3-ID-ALLOWLIST', 'admin user IDs must come from server environment');
requireMatch(security, /const emails = envList\('ADMIN_EMAILS'\)/, 'F3-EMAIL-ALLOWLIST', 'admin emails must come from server environment');
requireMatch(security, /export function requireAdmin\(session\)/, 'F3-REQUIRE-ADMIN', 'server must have a reusable deny-by-default admin guard');
requireMatch(security, /export async function authorizeAdminRequest\(req, res/, 'F3-MIDDLEWARE', 'server must expose centralized admin request middleware');
requireNoMatch(security, /app_metadata\.(?:role|is_admin)\s*===|user_metadata\.(?:role|is_admin)\s*===/, 'F3-METADATA-PRIVILEGE', 'editable/provider metadata must not independently grant admin');
requireMatch(adminEndpoint, /authorizeAdminRequest\(req, res/, 'F3-AUTHENTICATION', 'admin endpoint must authenticate through the centralized middleware');
requireMatch(adminEndpoint, /authorizeAdminRequest\(req, res/, 'F3-AUTHORIZATION', 'admin endpoint must use the centralized server authorization middleware');
requireNoMatch(frontend, /SUPABASE_SERVICE_ROLE_KEY|SCORE_SIGNING_SECRET|JWT_SECRET|DATABASE_URL|SMTP_PASSWORD/, 'F3-FRONTEND-CONFIG', 'server secrets must not be embedded in admin.html');

assert.equal(isAdminUser({ id: 'not-allowlisted', email: 'user@example.com', app_metadata: { role: 'admin' } }), false, 'metadata role bypassed admin allowlist');
assert.equal(isAdminUser({ id: 'not-allowlisted', email: 'user@example.com', app_metadata: { is_admin: true } }), false, 'metadata flag bypassed admin allowlist');
assert.equal(isAdminUser({ id: 'not-allowlisted', email: 'user@example.com', user_metadata: { role: 'admin' } }), false, 'user metadata bypassed admin allowlist');
assert.equal(isAdminUser({ id: 'allowlisted', email: 'admin@example.com' }), true, 'server allowlist did not grant configured admin');

function responseRecorder() {
  return { statusCode: null, headers: {}, payload: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    json(payload) { this.payload = payload; return this; } };
}
const unauthenticated = responseRecorder();
await createAdminDataHandler({ authenticateFn: async () => null })({ method: 'GET', headers: {} }, unauthenticated);
assert.equal(unauthenticated.statusCode, 401, 'admin endpoint must reject missing session');
const forbidden = responseRecorder();
await createAdminDataHandler({ authenticateFn: async () => ({ user: { id: 'not-allowlisted', email: 'user@example.com' } }) })({ method: 'GET', headers: {} }, forbidden);
assert.equal(forbidden.statusCode, 403, 'admin endpoint must reject authenticated non-admin');

if (findings.length) {
  console.error(`F-3 admin authorization audit failed (${findings.length} finding(s))`);
  for (const item of findings) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log('F-3 admin authorization audit: OK (server authorization and 401/403 behavior verified)');
}
