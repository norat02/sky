import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

process.env.SUPABASE_URL ||= 'https://unit-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'unit-test-service-role-key';
process.env.SCORE_SIGNING_SECRET ||= 'unit-test-signing-secret-with-more-than-32-chars';

const { signRunTicket, verifyRunTicket } = await import('../api/_security.mjs');
const { validName, validateScorePayload } = await import('../api/submit-score.mjs');

const userId = 'user-security-test';
const ticket = signRunTicket(userId);
assert.ok(verifyRunTicket(ticket, userId), 'fresh ticket must verify for its owner');
assert.equal(verifyRunTicket(ticket, 'different-user'), null, 'ticket must not verify for another user');
const [encoded, signature] = ticket.split('.');
const alteredSignature = `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;
assert.equal(verifyRunTicket(`${encoded}.${alteredSignature}`, userId), null, 'altered HMAC must be rejected');
const alteredPayload = Buffer.from(JSON.stringify({ v: 1, uid: userId, runId: crypto.randomUUID(), startedAt: Date.now(), exp: Date.now() + 1800000 })).toString('base64url');
assert.equal(verifyRunTicket(`${alteredPayload}.${signature}`, userId), null, 'payload changes must invalidate the original signature');

assert.equal(validName('Player'), true);
assert.equal(validName('  Player  '), true);
assert.equal(validName(''), false);
assert.equal(validName('<script>'), false);
assert.equal(validName('12345678901'), false);
assert.deepEqual(validateScorePayload({ name: '  Player  ', score: 42, ticket }), { name: 'Player', score: 42, ticket });
for (const bad of [
  { name: '<b>x</b>', score: 42, ticket },
  { name: 'Player', score: -1, ticket },
  { name: 'Player', score: 100001, ticket },
  { name: 'Player', score: 1.5, ticket },
  { name: 'Player', score: Number.MAX_SAFE_INTEGER + 1, ticket },
]) assert.equal(validateScorePayload(bad), null, `invalid payload must be rejected: ${JSON.stringify(bad)}`);

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(html, /if\(ok===false\)throw new Error\('ad incomplete'\)/, 'revive must reject incomplete ads');
assert.match(html, /RewardedSlotGrantedEvent|reward-granted|rewarded-ad/, 'rewarded-grant integration marker must exist');
assert.match(html, /reviveUsed=true/, 'revive must be consumed after a successful grant');
assert.match(html, /function securityLock\(reason\)/, 'anti-cheat security lock must exist');
assert.match(html, /function antiCheatCheck\(\)/, 'DevTools detection must exist');
assert.match(html, /function inspectInjectedNodes\(records\)/, 'DOM script injection guard must exist');
assert.match(html, /function allowedGameScript\(node\)/, 'allowed script allowlist must exist');
assert.match(html, /MutationObserver/, 'MutationObserver tamper guard must exist');
assert.match(html, /e\.key==='F12'/, 'F12 DevTools shortcut must be blocked');
assert.match(html, /state='LOCKED'/, 'suspicious activity must lock gameplay');
assert.match(html, /if\(ANTI_CHEAT\.locked\)return/, 'locked sessions must not start or flap');
assert.doesNotMatch(html, /deleteUser|auth\.admin\.deleteUser|deleteAccount/, 'client must not auto-delete accounts');
assert.match(html, /sky-ad-blocked/, 'AdBlock fallback event must be handled');
assert.doesNotMatch(html, /pendingScores:\s*cleanPending\(pendingScores\)/, 'backup must not export pending online scores');

console.log('run ticket HMAC ownership/tamper checks: OK');
console.log('Leaderboard score payload validation checks: OK');
console.log('rewarded revive incomplete-ad/AdBlock guard checks: OK');
console.log('anti-cheat DevTools lock and no-auto-delete checks: OK');
console.log('backup excludes pending online scores: OK');
