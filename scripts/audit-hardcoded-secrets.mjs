import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const roots = ['api', 'server', 'game.js', 'ui.js', 'player-sync.js', 'admin.html', 'index.html', 'scripts/generate-config.mjs'];
const excluded = /(?:^|\/)(?:node_modules|dist|coverage|test|tests|__tests__)(?:\/|$)|(?:^|\/)(?:\.env|\.env\.|package-lock\.json)$/i;
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', ...roots], { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean).filter((path) => !excluded.test(path));
const findings = [];
function finding(code, path, message) { findings.push(`${code}: ${path}: ${message}`); }
function scan(path, text) {
  const lines = text.split(/\r?\n/);
  const secretNames = '(?:JWT_SECRET|SCORE_SIGNING_SECRET|SUPABASE_SERVICE_ROLE_KEY|SMTP_PASSWORD|DATABASE_URL|NEON_DATABASE_URL|GOOGLE_CLIENT_SECRET|TURNSTILE_SECRET_KEY|ANDROID_KEYSTORE_PASSWORD|ANDROID_KEY_PASSWORD)';
  const credentialUrl = /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s/:@]+:[^\s@]+@/i;
  const privateKey = /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/;
  const envFallback = new RegExp(`process\\.env\\.${secretNames}\\s*\\|\\|\\s*['"][^'"\\n]+['"]`, 'i');
  const namedLiteral = new RegExp(`(?:const|let|var)\\s+(?:${secretNames})\\s*=\\s*['"][^'"\\n]{8,}['"]`, 'i');
  const tokenLiteral = /(?:api[_-]?key|access[_-]?token|client[_-]?secret|private[_-]?key)\s*[:=]\s*['"][A-Za-z0-9_./+=-]{16,}['"]/i;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const location = `${path}:${index + 1}`;
    if (credentialUrl.test(line)) finding('F4-CREDENTIAL-URL', location, 'credential-bearing connection URL is hardcoded');
    if (privateKey.test(line)) finding('F4-PRIVATE-KEY', location, 'private key material is hardcoded');
    if (envFallback.test(line)) finding('F4-ENV-FALLBACK', location, 'sensitive environment variable has a hardcoded fallback');
    if (namedLiteral.test(line)) finding('F4-NAMED-SECRET', location, 'sensitive variable has a literal value');
    if (tokenLiteral.test(line) && !/example|replace-with|your[-_]|placeholder/i.test(line)) finding('F4-TOKEN-LITERAL', location, 'credential-like literal detected');
  }
}
for (const path of files) {
  if (existsSync(path)) scan(path, readFileSync(path, 'utf8'));
}
const config = readFileSync('scripts/generate-config.mjs', 'utf8');
if (/SERVICE_ROLE|SCORE_SIGNING_SECRET|JWT_SECRET|SMTP_PASSWORD|DATABASE_URL|TURNSTILE_SECRET_KEY/i.test(config)) {
  finding('F4-CONFIG-ALLOWLIST', 'scripts/generate-config.mjs', 'server-only secret name is present in the public config allowlist');
}
const clientFiles = files.filter((path) => /^(?:game|ui|player-sync)\.js$|^(?:index|admin)\.html$/.test(path));
for (const path of clientFiles) {
  const text = readFileSync(path, 'utf8');
  if (/SUPABASE_SERVICE_ROLE_KEY|SCORE_SIGNING_SECRET|JWT_SECRET|SMTP_PASSWORD|DATABASE_URL|TURNSTILE_SECRET_KEY/i.test(text)) {
    finding('F4-CLIENT-SERVER-SECRET', path, 'server-only secret marker appears in client source');
  }
}
if (findings.length) {
  console.error(`F-4 hardcoded-sensitive-information audit failed (${findings.length} finding(s))`);
  for (const item of findings) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log(`F-4 hardcoded-sensitive-information audit: OK (${files.length} production source files checked)`);
}
