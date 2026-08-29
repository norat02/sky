import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const signingSecret = process.env.SCORE_SIGNING_SECRET;

export function json(res, status, payload) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(payload);
}

export function requireConfig() {
  if (!supabaseUrl || !serviceRoleKey || !signingSecret) {
    const error = new Error('server configuration missing');
    error.status = 500;
    throw error;
  }
}

export async function authenticate(req) {
  requireConfig();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return { admin, user: data.user };
}

function envList(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminUser(user) {
  if (!user) return false;
  const appMetadata = user.app_metadata || {};
  if (appMetadata.role === 'admin' || appMetadata.is_admin === true) return true;
  const userIds = envList('ADMIN_USER_IDS');
  const emails = envList('ADMIN_EMAILS');
  return userIds.includes(String(user.id || '').toLowerCase())
    || emails.includes(String(user.email || '').toLowerCase());
}

export function requireAdmin(session) {
  if (!session || !isAdminUser(session.user)) {
    const error = new Error('admin access required');
    error.status = 403;
    throw error;
  }
  return session;
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

export function signRunTicket(userId) {
  requireConfig();
  const now = Date.now();
  const payload = { v: 1, uid: userId, runId: crypto.randomUUID(), startedAt: now, exp: now + 30 * 60 * 1000 };
  const encoded = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', signingSecret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyRunTicket(token, userId) {
  if (typeof token !== 'string') return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', signingSecret).update(encoded).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { return null; }
  if (payload.v !== 1 || payload.uid !== userId || !payload.runId) return null;
  if (!Number.isSafeInteger(payload.startedAt) || !Number.isSafeInteger(payload.exp)) return null;
  const now = Date.now();
  if (payload.startedAt > now + 10_000 || payload.exp < now) return null;
  return payload;
}
