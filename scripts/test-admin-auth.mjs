import { strict as assert } from 'node:assert';
import { isAdminUser } from '../api/_security.mjs';
import { createAdminDataHandler } from '../api/admin-data.mjs';

process.env.ADMIN_EMAILS = 'admin@example.com, second@example.com';
process.env.ADMIN_USER_IDS = '11111111-1111-1111-1111-111111111111';

assert.equal(isAdminUser({ id: 'x', email: 'admin@example.com', app_metadata: {} }), true, 'allowlisted email must be admin');
assert.equal(isAdminUser({ id: 'x', email: 'ADMIN@EXAMPLE.COM', app_metadata: {} }), true, 'email matching must be case-insensitive');
assert.equal(isAdminUser({ id: '11111111-1111-1111-1111-111111111111', email: 'user@example.com', app_metadata: {} }), true, 'allowlisted user id must be admin');
assert.equal(isAdminUser({ id: 'x', email: 'user@example.com', app_metadata: { role: 'admin' } }), true, 'admin app role must be accepted');
assert.equal(isAdminUser({ id: 'x', email: 'user@example.com', app_metadata: { is_admin: true } }), true, 'admin app flag must be accepted');
assert.equal(isAdminUser({ id: 'x', email: 'user@example.com', user_metadata: { role: 'admin' }, app_metadata: {} }), false, 'editable user metadata must not grant admin');
assert.equal(isAdminUser({ id: 'x', email: 'user@example.com', app_metadata: {} }), false, 'ordinary user must not be admin');
assert.equal(isAdminUser(null), false, 'missing user must not be admin');

function responseRecorder() {
  return {
    statusCode: null,
    headers: {},
    payload: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

const unauthorized = responseRecorder();
await createAdminDataHandler({ authenticateFn: async () => null })({ method: 'GET', headers: {} }, unauthorized);
assert.equal(unauthorized.statusCode, 401, 'missing session must return 401');
assert.equal(unauthorized.payload.error, 'unauthorized');

const forbidden = responseRecorder();
await createAdminDataHandler({ authenticateFn: async () => ({ user: { id: 'x', email: 'user@example.com', app_metadata: {} } }) })({ method: 'GET', headers: {} }, forbidden);
assert.equal(forbidden.statusCode, 403, 'authenticated non-admin must return 403');
assert.equal(forbidden.payload.error, 'forbidden');

const calls = [];
const adminClient = {
  from(table) {
    calls.push(table);
    const builder = {
      select() { return builder; },
      order() { return builder; },
      limit() { return Promise.resolve({ data: table === 'scores' ? [{ player_name: 'Sky', score: 42, user_id: 'u1', created_at: '2026-08-29T00:00:00Z' }] : [{ score: 42 }], count: table === 'scores' ? 1 : null, error: null }); },
      not() { return Promise.resolve({ data: null, count: 1, error: null }); }
    };
    return builder;
  }
};
const allowed = responseRecorder();
await createAdminDataHandler({ authenticateFn: async () => ({ admin: adminClient, user: { id: 'x', email: 'admin@example.com', app_metadata: {} } }) })({ method: 'GET', headers: {} }, allowed);
assert.equal(allowed.statusCode, 200, 'admin must receive data');
assert.equal(allowed.payload.stats.topScore, 42);
assert.deepEqual(allowed.payload.scores[0].player_name, 'Sky');
assert.deepEqual(calls.sort(), ['score_runs', 'score_runs', 'scores', 'scores', 'scores'].sort(), 'admin handler must query expected tables');

console.log('admin auth seams: OK');
