import Redis from 'ioredis';

const memory = new Map();
const breaker = { failures: 0, openUntil: 0 };
const FAILURE_THRESHOLD = 3;
const OPEN_MS = 15_000;
export const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false }) : null;

function redisAvailable() { return redis && breaker.openUntil <= Date.now(); }
function redisFailed() {
  breaker.failures += 1;
  if (breaker.failures >= FAILURE_THRESHOLD) breaker.openUntil = Date.now() + OPEN_MS;
}
function redisSucceeded() { breaker.failures = 0; breaker.openUntil = 0; }

export async function getJson(key) {
  if (redisAvailable()) {
    try { const value = await redis.get(key); redisSucceeded(); return value ? JSON.parse(value) : null; } catch { redisFailed(); }
  }
  const entry = memory.get(key);
  if (!entry || entry.expiresAt < Date.now()) { memory.delete(key); return null; }
  return entry.value;
}

export async function setJson(key, value, ttlSeconds = 30) {
  if (redisAvailable()) {
    try { await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds); redisSucceeded(); return; } catch { redisFailed(); }
  }
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export async function rateLimit(key, limit, windowSeconds) {
  if (redisAvailable()) {
    try {
      const current = await redis.incr(`rl:${key}`);
      if (current === 1) await redis.expire(`rl:${key}`, windowSeconds);
      redisSucceeded();
      return { allowed: current <= limit, remaining: Math.max(0, limit - current) };
    } catch { redisFailed(); }
  }
  const now = Date.now();
  const entry = memory.get(`rl:${key}`);
  if (!entry || entry.expiresAt < now) { memory.set(`rl:${key}`, { value: 1, expiresAt: now + windowSeconds * 1000 }); return { allowed: true, remaining: limit - 1 }; }
  entry.value += 1;
  return { allowed: entry.value <= limit, remaining: Math.max(0, limit - entry.value) };
}

export function cacheCircuitState() {
  return { open: breaker.openUntil > Date.now(), failures: breaker.failures };
}
