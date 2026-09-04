import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, issueToken, readToken } from '../server/auth.mjs';
import { rateLimit } from '../server/cache.mjs';

const encoded = await hashPassword('correct horse battery staple');
assert.equal(await verifyPassword('correct horse battery staple', encoded), true);
assert.equal(await verifyPassword('wrong password', encoded), false);
const token = issueToken({ id: '00000000-0000-0000-0000-000000000001', email: 'player@example.com', role: 'player' });
assert.equal(readToken(token).role, 'player');
assert.equal(readToken(`${token.slice(0, -1)}x`), null);
const first = await rateLimit('smoke-test', 2, 60);
const second = await rateLimit('smoke-test', 2, 60);
const third = await rateLimit('smoke-test', 2, 60);
assert.equal(first.allowed, true);
assert.equal(second.allowed, true);
assert.equal(third.allowed, false);
console.log('API smoke tests: OK');
