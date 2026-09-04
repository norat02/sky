import Redis from 'ioredis';

const memory = new Map();
export const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 }) : null;

export async function getJson(key) {
  if (redis) { try { const value = await redis.get(key); return value ? JSON.parse(value) : null; } catch {} }
  const entry = memory.get(key);
  if (!entry || entry.expiresAt < Date.now()) { memory.delete(key); return null; }
  return entry.value;
}

export async function setJson(key, value, ttlSeconds = 30) {
  if (redis) { try { await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds); return; } catch {} }
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export async function rateLimit(key, limit, windowSeconds) {
  if (redis) {
    try {
      const current = await redis.incr(`rl:${key}`);
      if (current === 1) await redis.expire(`rl:${key}`, windowSeconds);
      return { allowed: current <= limit, remaining: Math.max(0, limit - current) };
    } catch {}
  }
  const now = Date.now();
  const entry = memory.get(`rl:${key}`);
  if (!entry || entry.expiresAt < now) { memory.set(`rl:${key}`, { value: 1, expiresAt: now + windowSeconds * 1000 }); return { allowed: true, remaining: limit - 1 }; }
  entry.value += 1;
  return { allowed: entry.value <= limit, remaining: Math.max(0, limit - entry.value) };
}
