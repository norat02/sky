import assert from 'node:assert/strict';
import { sanitizeMongoDocument, sanitizeMongoFilter } from '../server/mongodb-sanitize.mjs';

assert.deepEqual(sanitizeMongoFilter({ userId: ' player-1 ', score: { min: 10 }, tags: ['sky', 'bird'] }), {
  userId: 'player-1', score: { min: 10 }, tags: ['sky', 'bird']
});
for (const payload of [
  { $where: 'this.score > 0' },
  { '$gt': 0 },
  { 'profile.email': 'user@example.com' },
  { __proto__: { polluted: true } },
  { constructor: { prototype: { polluted: true } } },
]) {
  assert.throws(() => sanitizeMongoFilter(payload), (error) => error.code === 'MONGODB_INPUT_INVALID');
}
let deep = { value: 1 };
for (let index = 0; index < 8; index += 1) deep = { nested: deep };
assert.throws(() => sanitizeMongoDocument(deep), /too deeply nested/);
assert.throws(() => sanitizeMongoFilter({ value: 'x'.repeat(2049) }), /too long/);
assert.throws(() => sanitizeMongoFilter({ value: Number.NaN }), /number is invalid/);
console.log('MongoDB input sanitizer checks: OK');
