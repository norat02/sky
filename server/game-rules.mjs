const DEFAULT_SCORE_RATE = 25;
const MAX_SCORE = 100000;

export function maxPlausibleScore(startedAt, now = Date.now(), scoreRate = DEFAULT_SCORE_RATE) {
  const startedMs = new Date(startedAt).getTime();
  const currentMs = Number(now);
  const rate = Number(scoreRate);
  if (!Number.isFinite(startedMs) || !Number.isFinite(currentMs) || !Number.isFinite(rate) || rate <= 0 || startedMs > currentMs) return 0;
  const elapsedSeconds = Math.max(1, (currentMs - startedMs) / 1000);
  return Math.min(MAX_SCORE, Math.floor(elapsedSeconds * rate) + 5);
}

export function isScorePlausible(score, startedAt, now = Date.now(), scoreRate = DEFAULT_SCORE_RATE) {
  return Number.isSafeInteger(score) && score >= 0 && score <= maxPlausibleScore(startedAt, now, scoreRate);
}

export { DEFAULT_SCORE_RATE, MAX_SCORE };
