import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const sourceFiles = execFileSync('git', ['ls-files', 'server', 'api'], { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean).filter((path) => !/(?:test|audit|\.d\.ts)/i.test(path));
const findings = [];
function finding(code, path, message) { findings.push(`${code}: ${path}: ${message}`); }
function requireMatch(value, pattern, code, message) { if (!pattern.test(value)) finding(code, 'repository', message); }
function requireNoMatch(value, pattern, code, message) { if (pattern.test(value)) finding(code, 'repository', message); }
function scan(path, source) {
  const lines = source.split(/\r?\n/);
  const mongoOperation = /\.(?:find|findOne|aggregate|updateOne|updateMany|deleteOne|deleteMany|replaceOne|bulkWrite)\s*\(/i;
  const requestValue = /(?:req|request)\.(?:body|query|params|headers)/i;
  const dangerousOperator = /\$(?:where|function|accumulator|expr|jsonSchema)\b/i;
  const dynamicOperator = /\{\s*\[\s*(?:req|request)\.(?:body|query|params)/i;
  const unsafeLog = /console\.(?:log|info|warn|error)\s*\([^\n]*(?:req|request)\.(?:body|headers|query|params)|console\.(?:log|info|warn|error)\s*\([^\n]*(?:authorization|cookie|password|token|secret)/i;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const location = `${path}:${index + 1}`;
    if (mongoOperation.test(line) && requestValue.test(line)) finding('F7-REQUEST-QUERY', location, 'MongoDB operation receives request data without a validated query boundary');
    if (dangerousOperator.test(line)) finding('F7-DANGEROUS-OPERATOR', location, 'dangerous MongoDB operator requires an explicit trusted-server review');
    if (dynamicOperator.test(line)) finding('F7-DYNAMIC-OPERATOR', location, 'MongoDB operator key is derived from request input');
    if (unsafeLog.test(line)) finding('F7-SENSITIVE-LOG', location, 'request credentials, headers, body, or secrets may be written to logs');
  }
}
for (const path of sourceFiles) if (existsSync(path)) scan(path, readFileSync(path, 'utf8'));

const adapter = readFileSync('server/mongodb.mjs', 'utf8');
requireMatch(adapter, /export function assertAllowedMongoCollection\(collectionName\)/, 'F7-COLLECTION-GUARD', 'MongoDB adapter must validate collection names before access');
requireMatch(adapter, /const ALLOWED_COLLECTIONS = new Set\(Object\.values\(MONGO_COLLECTIONS\)\)/, 'F7-COLLECTION-ALLOWLIST', 'MongoDB adapter must use a fixed collection allowlist');
requireNoMatch(adapter, /\beval\s*\(|new\s+Function\s*\(/, 'F7-CODE-EVAL', 'MongoDB boundary must not use dynamic code execution');
requireNoMatch(adapter, /\$where|\$function|\$accumulator|\$expr|\$jsonSchema/, 'F7-ADAPTER-OPERATOR', 'MongoDB adapter must not expose dangerous query operators');

if (findings.length) {
  console.error(`F-7 NoSQL injection audit failed (${findings.length} finding(s))`);
  for (const item of findings) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log(`F-7 NoSQL injection audit: OK (${sourceFiles.length} server/API source files checked)`);
}
