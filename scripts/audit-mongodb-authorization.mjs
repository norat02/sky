import { existsSync, readFileSync } from 'node:fs';

const findings = [];
function finding(code, message) { findings.push(`${code}: ${message}`); }
function requireMatch(source, pattern, code, message) { if (!pattern.test(source)) finding(code, message); }
function requireNoMatch(source, pattern, code, message) { if (pattern.test(source)) finding(code, message); }

const adapter = existsSync('server/mongodb.mjs') ? readFileSync('server/mongodb.mjs', 'utf8') : '';
const envExample = readFileSync('.env.example', 'utf8');
const readme = readFileSync('README.md', 'utf8');
const docs = readFileSync('docs/security-controls-100-vi.md', 'utf8');

requireMatch(adapter, /process\.env\.MONGODB_URI/, 'F10-RUNTIME-AUTH', 'MongoDB credentials must be supplied through server runtime configuration');
requireMatch(adapter, /process\.env\.MONGODB_DATABASE/, 'F10-DATABASE-SCOPE', 'MongoDB adapter must select an explicit application database');
requireNoMatch(adapter, /(?:db|client)\.(?:admin|dropDatabase|createUser|dropUser|runCommand)\s*\(/i, 'F10-ADMIN-API', 'application adapter must not expose MongoDB administrative APIs');
requireNoMatch(adapter, /(?:MONGODB_ROOT|MONGODB_ADMIN|root|mongodb:\/\/root)/i, 'F10-ROOT-CREDENTIALS', 'MongoDB adapter must not contain root/admin credential markers');
requireNoMatch(adapter, /authMechanism\s*:\s*['"](?:MONGODB-CR|DEFAULT)['"]/i, 'F10-WEAK-AUTH', 'MongoDB adapter must not force a legacy/weak authentication mechanism');

requireMatch(envExample, /^MONGODB_URI=/m, 'F10-ENV-URI', 'MONGODB_URI must be documented as server-only');
requireMatch(envExample, /^MONGODB_DATABASE=/m, 'F10-ENV-DATABASE', 'MONGODB_DATABASE must be documented as server-only');
requireNoMatch(envExample, /MONGODB_URI=.*(?:root|admin)[^@]*@/i, 'F10-ENV-ROOT', 'environment template must not suggest a root/admin MongoDB account');
requireMatch(readme, /least[- ]privilege|quyền tối thiểu|database user riêng/i, 'F10-DOC-LEAST-PRIVILEGE', 'deployment documentation must require a dedicated least-privilege MongoDB user');
requireMatch(docs, /MongoDB|least[- ]privilege|quyền tối thiểu/i, 'F10-SECURITY-DOC', 'security documentation must record MongoDB least-privilege requirements');

if (findings.length) {
  console.error(`F-10 MongoDB authorization audit failed (${findings.length} finding(s))`);
  for (const item of findings) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log('F-10 MongoDB authorization audit: OK (runtime credentials, database scope, admin API isolation, and least-privilege documentation verified)');
}
