import crypto from 'node:crypto';

const secret = process.env.JWT_SECRET || 'dev-only-change-me';
const ttlSeconds = 60 * 60 * 24;

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
function sign(input) { return crypto.createHmac('sha256', secret).update(input).digest('base64url'); }

export function issueToken(user) {
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({ sub: user.id, email: user.email, role: user.role, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSeconds });
  return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

export function readToken(token) {
  try {
    const [header, payload, signature] = String(token || '').split('.');
    if (!header || !payload || !signature) return null;
    const expected = sign(`${header}.${payload}`);
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return body.exp > Math.floor(Date.now() / 1000) ? body : null;
  } catch { return null; }
}

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
  const user = readToken(token);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  return next();
}

export function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'forbidden' });
}
