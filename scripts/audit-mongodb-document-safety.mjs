import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const sourceFiles = execFileSync('git', ['ls-files', 'server', 'api'], { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean).filter((path) => !/(?:test|audit|\.d\.ts)/i.test(path));
const findings = [];
function finding(code, path, message) { findings.push(`${code}: ${path}: ${message}`); }
function requireMatch(value, pattern, code, message) { if (!pattern.test(value)) finding(code, 'repository', message); }

const sanitizerPath = 'server/mongodb-sanitize.mjs';
const adapterPath = 'server/mongodb.mjs';
const sanitizer = existsSync(sanitizerPath) ? readFileSync(sanitizerPath, 'utf8') : '';
const adapter = existsSync(adapterPath) ? readFileSync(adapterPath, 'utf8') : '';
requireMatch(sanitizer, /MAX_DEPTH\s*=\s*\d+/, 'F8-DEPTH-LIMIT', 'Mongo documents must have a maximum nesting depth');
requireMatch(sanitizer, /MAX_KEYS\s*=\s*\d+/, 'F8-KEY-LIMIT', 'Mongo documents must have a maximum key count');
requireMatch(sanitizer, /MAX_STRING_LENGTH\s*=\s*\d+/, 'F8-STRING-LIMIT', 'Mongo strings must have a maximum length');
requireMatch(sanitizer, /FORBIDDEN_KEYS\s*=\s*new Set/, 'F8-PROTOTYPE-GUARD', 'Mongo documents must reject prototype-pollution keys');
requireMatch(adapter, /sanitizeMongoDocument/, 'F8-DOCUMENT-SANITIZER', 'Mongo adapter must expose document sanitization before writes');
requireMatch(adapter, /sanitizeMongoFilter/, 'F8-FILTER-SANITIZER', 'Mongo adapter must expose filter sanitization before reads/updates');

for (const path of sourceFiles) {
  if (!existsSync(path)) continue;
  const source = readFileSync(path, 'utf8');
  const lines = source.split(/\r?\n/);
  const mongoWrite = /\.(?:insertOne|insertMany|updateOne|updateMany|replaceOne|bulkWrite)\s*\(/i;
  const rawRequestDocument = /(?:insertOne|insertMany|updateOne|updateMany|replaceOne)\s*\(\s*(?:req|request)\.(?:body|query|params)/i;
  const rawSensitive = /(?:password|refresh[_-]?token|access[_-]?token|authorization|cookie|service[_-]?role|smtp[_-]?password|secret)/i;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const location = `${path}:${index + 1}`;
    if (mongoWrite.test(line) && !/sanitizeMongoDocument/.test(line)) finding('F8-UNSANITIZED-WRITE', location, 'Mongo write must use sanitizeMongoDocument');
    if (rawRequestDocument.test(line)) finding('F8-RAW-REQUEST', location, 'raw request data must not be written directly to MongoDB');
    if (/console\.(?:log|info|warn|error)\s*\(/.test(line) && rawSensitive.test(line)) finding('F8-SENSITIVE-LOG', location, 'sensitive fields must be redacted before logging');
    if (/JSON\.stringify\(\s*(?:req|request)\.(?:body|headers|query|params)/.test(line)) finding('F8-RAW-REQUEST-LOG', location, 'raw request object must not be serialized into logs');
  }
}

if (findings.length) {
  console.error(`F-8 MongoDB document-safety audit failed (${findings.length} finding(s))`);
  for (const item of findings) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log(`F-8 MongoDB document-safety audit: OK (${sourceFiles.length} server/API source files checked)`);
}
