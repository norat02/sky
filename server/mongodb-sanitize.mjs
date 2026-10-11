const MAX_DEPTH = 6;
const MAX_KEYS = 64;
const MAX_ARRAY_ITEMS = 128;
const MAX_STRING_LENGTH = 2048;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function invalid(message) {
  const error = new Error(message);
  error.code = 'MONGODB_INPUT_INVALID';
  error.status = 400;
  return error;
}

function sanitize(value, depth) {
  if (depth > MAX_DEPTH) throw invalid('mongo input is too deeply nested');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) throw invalid('mongo string is too long');
    return value.trim();
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw invalid('mongo number is invalid');
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) throw invalid('mongo array is too large');
    return value.map((item) => sanitize(item, depth + 1));
  }
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw invalid('mongo input type is invalid');
  }
  const keys = Object.keys(value);
  if (keys.length > MAX_KEYS) throw invalid('mongo object has too many keys');
  const output = {};
  for (const key of keys) {
    if (!key || key.startsWith('$') || key.includes('.') || FORBIDDEN_KEYS.has(key)) {
      throw invalid('mongo operator or path key is not allowed');
    }
    output[key] = sanitize(value[key], depth + 1);
  }
  return output;
}

export function sanitizeMongoFilter(filter = {}) {
  const output = sanitize(filter, 0);
  if (!output || Array.isArray(output) || typeof output !== 'object') throw invalid('mongo filter must be an object');
  return output;
}

export function sanitizeMongoDocument(document) {
  const output = sanitize(document, 0);
  if (!output || Array.isArray(output) || typeof output !== 'object') throw invalid('mongo document must be an object');
  return output;
}
