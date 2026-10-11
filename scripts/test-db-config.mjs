import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const dbModule = pathToFileURL(resolve('server/db.mjs')).href;
const importCode = `import(${JSON.stringify(dbModule)})`;
const baseEnv = { PATH: process.env.PATH || '', HOME: process.env.HOME || '/tmp', NODE_ENV: 'test' };

const missing = spawnSync(process.execPath, ['--input-type=module', '--eval', importCode], {
  cwd: '/tmp', env: baseEnv, encoding: 'utf8'
});
assert.notEqual(missing.status, 0, 'database module must fail closed without a connection string');
assert.match(`${missing.stdout}\n${missing.stderr}`, /DATABASE_URL or NEON_DATABASE_URL is required/);

const configured = spawnSync(process.execPath, ['--input-type=module', '--eval', importCode], {
  cwd: '/tmp',
  env: { ...baseEnv, DATABASE_URL: 'postgres://user:password@example.invalid/sky?sslmode=require' },
  encoding: 'utf8'
});
assert.equal(configured.status, 0, `database module rejected explicit configuration: ${configured.stderr}`);
console.log('database configuration fail-closed checks: OK');
