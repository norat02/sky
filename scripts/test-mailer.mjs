import assert from 'node:assert/strict';
import {
  buildNotificationEmail,
  buildVerificationEmail,
  resetMailerForTests,
  sendNotificationEmail,
  sendVerificationEmail,
} from '../server/mailer.mjs';

process.env.SMTP_ENABLED = 'true';
process.env.SMTP_HOST = 'smtp.test.invalid';
process.env.SMTP_PORT = '587';
process.env.SMTP_SECURE = 'false';
process.env.SMTP_USER = 'mailer@example.test';
process.env.SMTP_PASSWORD = 'test-only-secret';
process.env.SMTP_FROM = 'Sky Bird <mailer@example.test>';

const sent = [];
const transport = {
  __skyFrom: process.env.SMTP_FROM,
  async sendMail(message) {
    sent.push(message);
    return { messageId: 'test-message' };
  },
};

const verification = buildVerificationEmail({
  displayName: '<Alice>',
  verificationUrl: 'https://sky.norat.click/verify?token=test',
});
assert.match(verification.html, /&lt;Alice&gt;/);
assert.doesNotMatch(verification.html, /<Alice>/);
assert.match(verification.text, /https:\/\/sky\.norat\.click/);

await sendVerificationEmail({
  to: 'alice@example.test',
  displayName: 'Alice',
  verificationUrl: 'https://sky.norat.click/verify?token=test',
  transport,
});
await sendNotificationEmail({
  to: 'alice@example.test',
  title: 'Điểm mới',
  message: 'Bạn vừa đạt 42 điểm.',
  actionLabel: 'Mở game',
  actionUrl: 'https://sky.norat.click/',
  transport,
});
assert.equal(sent.length, 2);
assert.equal(sent[0].from, 'Sky Bird <mailer@example.test>');
assert.equal(sent[1].to, 'alice@example.test');
assert.match(sent[1].html, /Bạn vừa đạt 42 điểm/);

assert.throws(() => buildVerificationEmail({ verificationUrl: 'javascript:alert(1)' }), /invalid_verification_url/);
assert.throws(() => buildNotificationEmail({ title: 'x', message: 'y', actionUrl: 'javascript:alert(1)' }), /invalid_notification_url/);
await assert.rejects(() => sendNotificationEmail({ to: 'not-an-email', title: 'x', message: 'y', transport }), /invalid_email_recipient/);

process.env.SMTP_ENABLED = 'false';
resetMailerForTests();
await assert.rejects(() => sendNotificationEmail({ to: 'alice@example.test', title: 'x', message: 'y' }), /smtp_disabled/);

console.log('SMTP mailer tests: OK');
