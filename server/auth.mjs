import crypto from 'node:crypto';

const secret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'local-development-secret-change-me-32chars');
const ttlSeconds = Number(process.env.JWT_TTL_SECONDS || 60 * 60 * 24);
const issuer = process.env.JWT_ISSUER || 'sky-bird-api';
const audience = process.env.JWT_AUDIENCE || 'sky-bird-client';

function requireSecret() {
  if (!secret || secret.length < 32 || (process.env.NODE_ENV === 'production' && secret === 'dev-only-change-me')) {
    const error = new Error('JWT_SECRET must be a random secret of at least 32 characters');
    error.status = 500;
    throw error;
  }
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key.toString('hex'))));
  return `scrypt$${salt}$${derived}`;
}

export async function verifyPassword(password, encoded) {
  const [, salt, expected] = String(encoded || '').split('$');
  if (!salt || !expected) return false;
  const actual = await new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key.toString('hex'))));
  return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function b64(value) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function sign(input) { requireSecret(); return crypto.createHmac('sha256', secret).update(input).digest('base64url'); }

export function issueToken(user, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + Number(options.ttlSeconds || ttlSeconds);
  const jti = options.jti || crypto.randomUUID();
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({ iss: issuer, aud: audience, sub: user.id, email: user.email, role: user.role, jti, iat: now, exp });
  return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

export function readToken(token) {
  try {
    requireSecret();
    const [header, payload, signature] = String(token || '').split('.');
    if (!header || !payload || !signature) return null;
    const expected = sign(`${header}.${payload}`);
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (parsedHeader.alg !== 'HS256' || parsedHeader.typ !== 'JWT' || body.iss !== issuer || body.aud !== audience || !body.sub || !body.jti || !Number.isInteger(body.iat) || !Number.isInteger(body.exp) || body.iat > now + 30 || body.exp <= now) return null;
    return body;
  } catch { return null; }
}

export function tokenExpiresAt(token) {
  const body = readToken(token);
  return body ? new Date(body.exp * 1000) : null;
}

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : '';
  const user = readToken(token);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  req.authToken = token;
  return next();
}

export function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'forbidden' });
}

export function hashRequest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export { ttlSeconds };
