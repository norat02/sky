import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAdminUser } from '../api/_security.mjs';
import { verifyCaptchaToken } from '../server/captcha.mjs';

process.env.ADMIN_EMAILS = 'admin@example.com';
process.env.ADMIN_USER_IDS = '11111111-1111-1111-1111-111111111111';
assert.equal(isAdminUser({ id: 'x', email: 'admin@example.com', app_metadata: { role: 'admin' } }), true, 'allowlisted admin must pass');
assert.equal(isAdminUser({ id: 'x', email: 'user@example.com', app_metadata: { role: 'admin' } }), false, 'metadata alone must not grant admin');
assert.equal(isAdminUser({ id: 'x', email: 'user@example.com', app_metadata: { is_admin: true } }), false, 'metadata flag alone must not grant admin');

process.env.CAPTCHA_ENABLED = 'true';
process.env.TURNSTILE_SECRET_KEY = 'server-secret';
process.env.TURNSTILE_VERIFY_URL = 'https://captcha.test/siteverify';
const captchaCalls = [];
const accepted = await verifyCaptchaToken('token-1', {
  fetchImpl: async (url, options) => {
    captchaCalls.push({ url, options });
    return { ok: true, async json() { return { success: true, action: 'register', hostname: 'sky.norat.click' }; } };
  },
  expectedAction: 'register',
  expectedHostname: 'sky.norat.click',
});
assert.equal(accepted.ok, true, 'valid CAPTCHA must pass');
assert.equal(captchaCalls.length, 1);
assert.match(String(captchaCalls[0].options.body), /secret=server-secret/);
assert.match(String(captchaCalls[0].options.body), /response=token-1/);
await assert.rejects(() => verifyCaptchaToken('', { fetchImpl: async () => { throw new Error('must not call'); } }), /captcha_required/);
await assert.rejects(() => verifyCaptchaToken('bad', { fetchImpl: async () => ({ ok: true, async json() { return { success: false }; } }) }), /captcha_failed/);

const authSource = await readFile('server/auth.mjs', 'utf8');
assert.doesNotMatch(authSource, /local-development-secret-change-me/);
const appSource = await readFile('server/app.mjs', 'utf8');
assert.match(appSource, /verifyCaptchaToken/);
const profiles = await readFile('server/migrations/004_player_profiles.sql', 'utf8');
assert.match(profiles, /FOR SELECT USING \(user_id = auth\.uid\(\)\)/);
assert.match(profiles, /FOR UPDATE USING \(user_id = auth\.uid\(\)\)/);
assert.doesNotMatch(profiles, /USING \(true\)/);

console.log('security controls tests: OK');
