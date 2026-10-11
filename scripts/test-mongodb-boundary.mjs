import assert from 'node:assert/strict';
import {
  MONGO_COLLECTIONS,
  allowedMongoCollections,
  assertAllowedMongoCollection,
  getMongoCollection,
  isAllowedMongoCollection,
} from '../server/mongodb.mjs';

assert.equal(isAllowedMongoCollection(MONGO_COLLECTIONS.GAME_LOGS), true);
assert.equal(isAllowedMongoCollection('users'), false);
assert.equal(isAllowedMongoCollection('../users'), false);
assert.deepEqual(allowedMongoCollections().sort(), [
  'ai_data', 'analytics_events', 'error_logs', 'game_logs', 'player_activity', 'telemetry'
]);
assert.equal(assertAllowedMongoCollection('telemetry'), 'telemetry');
assert.throws(() => assertAllowedMongoCollection('users'), (error) => error.code === 'MONGODB_COLLECTION_NOT_ALLOWED' && error.status === 400);

delete process.env.MONGODB_URI;
await assert.rejects(
  () => getMongoCollection('telemetry'),
  (error) => error.code === 'MONGODB_CONFIG_MISSING'
);
console.log('MongoDB boundary allowlist and fail-closed checks: OK');
