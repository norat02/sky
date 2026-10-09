import nodemailer from 'nodemailer';

let cachedTransport = null;

function smtpEnabled() {
  return String(process.env.SMTP_ENABLED || '').toLowerCase() === 'true';
}

function requiredConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = String(process.env.SMTP_USER || '').trim();
  const password = String(process.env.SMTP_PASSWORD || '');
  const from = String(process.env.SMTP_FROM || '').trim();
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  if (!smtpEnabled()) {
    const error = new Error('smtp_disabled');
    error.code = 'smtp_disabled';
    throw error;
  }
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !password || !from) {
    const error = new Error('smtp_configuration_missing');
    error.code = 'smtp_configuration_missing';
    error.status = 500;
    throw error;
  }
  return { host, port, secure, auth: { user, pass: password }, from };
}

function getTransport() {
  if (!cachedTransport) {
    const config = requiredConfig();
    cachedTransport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    cachedTransport.__skyFrom = config.from;
  }
  return cachedTransport;
}

export function resetMailerForTests() {
  cachedTransport = null;
}

function validEmail(value) {
  return typeof value === 'string'
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function requireRecipient(to) {
  if (!validEmail(to)) {
    const error = new Error('invalid_email_recipient');
    error.code = 'invalid_email_recipient';
    error.status = 400;
    throw error;
  }
  return to.trim();
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function baseLayout({ title, body, actionLabel, actionUrl }) {
  const action = actionUrl && actionLabel
    ? `<p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 18px;background:#c73e3a;color:#fff;text-decoration:none;border-radius:6px">${escapeHtml(actionLabel)}</a></p>`
    : '';
  return `<!doctype html><html lang="vi"><body style="margin:0;background:#f0e7d3;color:#26221c;font:16px/1.5 Arial,sans-serif"><main style="max-width:560px;margin:32px auto;padding:28px;background:#fffaf0;border:1px solid #d7cbb3;border-radius:12px"><h1 style="margin-top:0;color:#c73e3a;font-size:24px">Sky Bird</h1><h2 style="font-size:20px">${escapeHtml(title)}</h2>${body}${action}<p style="color:#6e6659;font-size:13px">Nếu bạn không yêu cầu email này, hãy bỏ qua. Đừng chia sẻ liên kết hoặc mã xác thực.</p></main></body></html>`;
}

export async function sendEmail({ to, subject, text, html, transport } = {}) {
  const recipient = requireRecipient(to);
  if (typeof subject !== 'string' || !subject.trim() || subject.length > 200) {
    const error = new Error('invalid_email_subject');
    error.code = 'invalid_email_subject';
    error.status = 400;
    throw error;
  }
  if (typeof text !== 'string' || !text.trim() || text.length > 100_000) {
    const error = new Error('invalid_email_body');
    error.code = 'invalid_email_body';
    error.status = 400;
    throw error;
  }
  const mailer = transport || getTransport();
  return mailer.sendMail({
    from: mailer.__skyFrom || requiredConfig().from,
    to: recipient,
    subject: subject.trim(),
    text,
    html: typeof html === 'string' && html.trim() ? html : undefined,
  });
}

export function buildVerificationEmail({ displayName = 'bạn', verificationUrl } = {}) {
  if (typeof verificationUrl !== 'string' || !/^https:\/\//i.test(verificationUrl)) {
    const error = new Error('invalid_verification_url');
    error.code = 'invalid_verification_url';
    error.status = 400;
    throw error;
  }
  const safeName = String(displayName).trim().slice(0, 80) || 'bạn';
  return {
    subject: 'Xác thực tài khoản Sky Bird',
    text: `Xin chào ${safeName},\n\nHãy mở liên kết sau để xác thực tài khoản Sky Bird:\n${verificationUrl}\n\nNếu bạn không tạo tài khoản, hãy bỏ qua email này.`,
    html: baseLayout({
      title: 'Xác thực tài khoản',
      body: `<p>Xin chào ${escapeHtml(safeName)},</p><p>Hãy xác thực tài khoản Sky Bird bằng nút bên dưới.</p>`,
      actionLabel: 'Xác thực tài khoản',
      actionUrl: verificationUrl,
    }),
  };
}

export function buildNotificationEmail({ title, message, actionLabel, actionUrl } = {}) {
  if (typeof title !== 'string' || !title.trim() || title.length > 160 || typeof message !== 'string' || !message.trim() || message.length > 20_000) {
    const error = new Error('invalid_notification');
    error.code = 'invalid_notification';
    error.status = 400;
    throw error;
  }
  const safeTitle = title.trim();
  const safeMessage = message.trim();
  const safeActionUrl = actionUrl === undefined ? undefined : actionUrl;
  if (safeActionUrl !== undefined && (typeof safeActionUrl !== 'string' || !/^https:\/\//i.test(safeActionUrl))) {
    const error = new Error('invalid_notification_url');
    error.code = 'invalid_notification_url';
    error.status = 400;
    throw error;
  }
  return {
    subject: `Sky Bird — ${safeTitle}`,
    text: `${safeTitle}\n\n${safeMessage}${safeActionUrl ? `\n\n${safeActionUrl}` : ''}`,
    html: baseLayout({
      title: safeTitle,
      body: `<p>${escapeHtml(safeMessage).replaceAll('\n', '<br>')}</p>`,
      actionLabel,
      actionUrl: safeActionUrl,
    }),
  };
}

export async function sendVerificationEmail({ to, displayName, verificationUrl, transport } = {}) {
  return sendEmail({ to, transport, ...buildVerificationEmail({ displayName, verificationUrl }) });
}

export async function sendNotificationEmail({ to, title, message, actionLabel, actionUrl, transport } = {}) {
  return sendEmail({ to, transport, ...buildNotificationEmail({ title, message, actionLabel, actionUrl }) });
}
