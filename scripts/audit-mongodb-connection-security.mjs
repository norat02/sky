import { existsSync, readFileSync } from 'node:fs';

const findings = [];
function finding(code, message) { findings.push(`${code}: ${message}`); }
function requireMatch(source, pattern, code, message) { if (!pattern.test(source)) finding(code, message); }
function requireNoMatch(source, pattern, code, message) { if (pattern.test(source)) finding(code, message); }

const adapterPath = 'server/mongodb.mjs';
const adapter = existsSync(adapterPath) ? readFileSync(adapterPath, 'utf8') : '';
const envExample = readFileSync('.env.example', 'utf8');
const config = readFileSync('scripts/generate-config.mjs', 'utf8');
const clientSources = ['game.js', 'ui.js', 'player-sync.js', 'index.html', 'admin.html']
  .filter((path) => existsSync(path)).map((path) => ({ path, source: readFileSync(path, 'utf8') }));

requireMatch(adapter, /new MongoClient\(mongoUri\(\),\s*\{/, 'F9-MONGO-CLIENT', 'MongoDB connection must be created in the server adapter');
requireMatch(adapter, /tls\s*:\s*true/, 'F9-TLS-REQUIRED', 'MongoDB TLS must be explicitly enabled');
requireNoMatch(adapter, /tlsAllowInvalidCertificates\s*:\s*true|sslValidate\s*:\s*false|rejectUnauthorized\s*:\s*false/i, 'F9-TLS-BYPASS', 'MongoDB certificate validation must not be disabled');
requireMatch(adapter, /serverSelectionTimeoutMS\s*:\s*\d+/, 'F9-CONNECT-TIMEOUT', 'MongoDB connection must have a bounded server selection timeout');
requireMatch(adapter, /maxPoolSize\s*:\s*\d+/, 'F9-POOL-LIMIT', 'MongoDB connection must have a bounded pool size');
requireMatch(adapter, /retryWrites\s*:\s*true/, 'F9-RETRY-WRITES', 'MongoDB writes must use acknowledged retryable writes');
requireMatch(adapter, /process\.env\.MONGODB_URI/, 'F9-RUNTIME-URI', 'MongoDB URI must be read from server runtime environment');
requireNoMatch(adapter, /console\.(?:log|info|warn|error)[^\n]*(?:mongoUri|MONGODB_URI|mongodb(?:\+srv)?:\/\/)/i, 'F9-URI-LOG', 'MongoDB URI must never be written to logs');
requireNoMatch(adapter, /mongodb(?:\+srv)?:\/\/[^\s'"`]+/i, 'F9-HARDCODED-URI', 'MongoDB connection URI must not have a source-code fallback');
requireMatch(envExample, /^MONGODB_URI=/m, 'F9-ENV-URI', 'MONGODB_URI must be documented as server-only');
requireMatch(envExample, /^MONGODB_DATABASE=/m, 'F9-ENV-DATABASE', 'MONGODB_DATABASE must be documented as server-only');
requireNoMatch(config, /MONGODB_URI|MONGODB_DATABASE|MONGO_URI/i, 'F9-PUBLIC-CONFIG', 'MongoDB connection settings must not enter public build config');
for (const { path, source } of clientSources) {
  requireNoMatch(source, /MONGODB_URI|MONGODB_DATABASE|mongodb(?:\+srv)?:\/\//i, 'F9-CLIENT-CREDENTIALS', `MongoDB connection settings must not appear in client source: ${path}`);
}

if (findings.length) {
  console.error(`F-9 MongoDB connection-security audit failed (${findings.length} finding(s))`);
  for (const item of findings) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log('F-9 MongoDB connection-security audit: OK (TLS, timeouts, pool, runtime credentials, and client isolation verified)');
}
