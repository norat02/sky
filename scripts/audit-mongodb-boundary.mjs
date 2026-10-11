import { existsSync, readFileSync } from 'node:fs';

const findings = [];
const frontendFiles = ['game.js', 'ui.js', 'player-sync.js', 'index.html', 'admin.html'].filter(existsSync);
function finding(code, message) { findings.push(`${code}: ${message}`); }
function requireMatch(value, pattern, code, message) { if (!pattern.test(value)) finding(code, message); }
function requireNoMatch(value, pattern, code, message) { if (pattern.test(value)) finding(code, message); }

const config = readFileSync('scripts/generate-config.mjs', 'utf8');
const envExample = readFileSync('.env.example', 'utf8');
const mongoBoundary = ['server/mongodb.mjs', 'server/mongo.mjs'].find(existsSync);

// The architecture must have one server-only Mongo boundary before Mongo data is used.
if (!mongoBoundary) {
  finding('F6-MONGO-BOUNDARY-MISSING', 'MongoDB is shown in the target architecture but no server MongoDB adapter exists');
} else {
  const source = readFileSync(mongoBoundary, 'utf8');
  requireMatch(source, /process\.env\.MONGODB_URI/, 'F6-MONGO-RUNTIME-CONFIG', 'MongoDB adapter must read MONGODB_URI at server runtime');
  requireMatch(source, /(?:allowedCollections|COLLECTION_ALLOWLIST|ALLOWED_COLLECTIONS)/, 'F6-MONGO-COLLECTION-ALLOWLIST', 'MongoDB adapter must use an explicit collection allowlist');
  requireNoMatch(source, /(?:collection|collectionName)\s*[:=]\s*(?:req\.|request\.|body\.|query\.|params\.)/i, 'F6-MONGO-UNTRUSTED-COLLECTION', 'Mongo collection names must not be taken directly from request input');
  requireNoMatch(source, /find\(\s*req\.|aggregate\(\s*req\.|updateOne\(\s*req\.|deleteOne\(\s*req\./, 'F6-MONGO-UNVALIDATED-QUERY', 'Mongo query filters must be validated before database calls');
}

requireMatch(envExample, /^MONGODB_URI=/m, 'F6-MONGO-ENV-DOCUMENTED', 'MONGODB_URI must be documented as a server-only environment variable');
requireNoMatch(config, /MONGODB_URI|MONGODB_DATABASE|MONGO_URI/i, 'F6-MONGO-PUBLIC-CONFIG', 'MongoDB server configuration must not be included in public build config');
for (const path of frontendFiles) {
  const source = readFileSync(path, 'utf8');
  requireNoMatch(source, /mongodb(?:\+srv)?:\/\/|MONGODB_URI|MONGO_URI|from\s+['"](?:mongodb|mongoose)['"]/i, 'F6-MONGO-CLIENT-ACCESS', `frontend must not contain MongoDB credentials, driver, or direct connection: ${path}`);
}

if (findings.length) {
  console.error(`F-6 MongoDB boundary audit failed (${findings.length} finding(s))`);
  for (const item of findings) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log('F-6 MongoDB boundary audit: OK (server-only adapter, runtime secret, collection allowlist, and client isolation verified)');
}
