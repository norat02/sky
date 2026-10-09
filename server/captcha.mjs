const DEFAULT_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function config() {
  const enabled = String(process.env.CAPTCHA_ENABLED || '').toLowerCase() === 'true';
  const secret = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
  const verifyUrl = String(process.env.TURNSTILE_VERIFY_URL || DEFAULT_VERIFY_URL).trim();
  const expectedAction = String(process.env.CAPTCHA_EXPECTED_ACTION || 'register').trim();
  const expectedHostname = String(process.env.CAPTCHA_EXPECTED_HOSTNAME || '').trim();
  return { enabled, secret, verifyUrl, expectedAction, expectedHostname };
}

function captchaError(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

export async function verifyCaptchaToken(token, {
  fetchImpl = globalThis.fetch,
  expectedAction = config().expectedAction,
  expectedHostname = config().expectedHostname,
} = {}) {
  const settings = config();
  if (!settings.enabled) return { ok: true, skipped: true };
  if (!settings.secret) throw captchaError('captcha_not_configured', 500);
  if (typeof fetchImpl !== 'function') throw captchaError('captcha_unavailable', 503);
  if (typeof token !== 'string' || token.trim().length < 1 || token.length > 4096) throw captchaError('captcha_required');

  const body = new URLSearchParams({ secret: settings.secret, response: token.trim() });
  let response;
  try {
    response = await fetchImpl(settings.verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw captchaError('captcha_unavailable', 503);
  }
  if (!response?.ok) throw captchaError('captcha_unavailable', 503);
  let result;
  try { result = await response.json(); } catch { throw captchaError('captcha_unavailable', 503); }
  if (!result?.success) throw captchaError('captcha_failed');
  if (expectedAction && result.action && result.action !== expectedAction) throw captchaError('captcha_action_mismatch');
  if (expectedHostname && result.hostname && result.hostname !== expectedHostname) throw captchaError('captcha_hostname_mismatch');
  return { ok: true, skipped: false };
}
