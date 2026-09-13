import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT = '2';
process.env.JWT_SECRET = 'integration-test-secret-that-is-at-least-32-chars';

const { app } = await import('../server/app.mjs');
const { maxPlausibleScore, isScorePlausible } = await import('../server/game-rules.mjs');
const live = await request(app).get('/live');
assert.equal(live.status, 200, 'liveness endpoint must not depend on database availability');
assert.equal(live.body.status, 'alive');

const now = Date.now();
const startedTenSecondsAgo = new Date(now - 10_000).toISOString();
assert.equal(maxPlausibleScore(startedTenSecondsAgo, now, 25), 255, 'score ceiling should include elapsed time and grace');
assert.equal(isScorePlausible(255, startedTenSecondsAgo, now, 25), true);
assert.equal(isScorePlausible(256, startedTenSecondsAgo, now, 25), false, 'score above plausible ceiling must be rejected');
assert.equal(isScorePlausible(1, new Date(now + 1_000).toISOString(), now, 25), false, 'future start timestamp must fail closed');
assert.equal(isScorePlausible(100001, startedTenSecondsAgo, now, 25), false, 'score outside database range must fail closed');

const clientIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
const first = await request(app).get('/api/v1/leaderboard?cursor=malformed').set('X-Forwarded-For', clientIp);
const second = await request(app).get('/api/v1/leaderboard?cursor=malformed').set('X-Forwarded-For', clientIp);
const third = await request(app).get('/api/v1/leaderboard?cursor=malformed').set('X-Forwarded-For', clientIp);
assert.equal(first.status, 400, 'first request should reach API validation');
assert.equal(second.status, 400, 'second request should still be allowed within the window');
assert.equal(third.status, 429, 'third request must be rate limited');
assert.equal(third.body.error, 'rate_limited');
assert.match(third.headers['x-request-id'], /^[0-9a-f-]{36}$/i);
assert.equal(third.headers['x-ratelimit-remaining'], '0');

console.log('API security integration tests: anti-cheat, rate limiting, and liveness OK');
