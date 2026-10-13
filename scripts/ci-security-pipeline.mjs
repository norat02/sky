import { spawnSync } from 'node:child_process';

const steps = [
  ['build', 'npm', ['run', 'build']],
  ['source verification', 'npm', ['run', 'verify']],
  ['regression tests', 'npm', ['test']],
  ['SMTP mailer tests', 'npm', ['run', 'test:mailer']],
  ['database configuration tests', 'npm', ['run', 'test:db:config']],
  ['F-2 frontend PII audit', 'npm', ['run', 'audit:f2']],
  ['F-3 admin authorization audit', 'npm', ['run', 'audit:f3']],
  ['F-4 hardcoded secrets audit', 'npm', ['run', 'audit:f4']],
  ['F-5 RLS/access-control audit', 'npm', ['run', 'audit:f5']],
  ['F-6 MongoDB boundary audit', 'npm', ['run', 'audit:f6']],
  ['F-7 NoSQL injection audit', 'npm', ['run', 'audit:f7']],
  ['F-8 MongoDB document-safety audit', 'npm', ['run', 'audit:f8']],
  ['F-9 MongoDB connection-security audit', 'npm', ['run', 'audit:f9']],
  ['F-10 MongoDB authorization audit', 'npm', ['run', 'audit:f10']],
  ['API smoke tests', 'npm', ['run', 'test:api']],
  ['API security integration tests', 'npm', ['run', 'test:api:integration']],
];

const startedAt = Date.now();
for (const [label, command, args] of steps) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
  if (result.error) {
    console.error(`CI security pipeline failed while running ${label}: ${result.error.message}`);
    process.exitCode = result.status || 1;
    break;
  }
  if (result.status !== 0) {
    console.error(`CI security pipeline failed at ${label} with exit code ${result.status}`);
    process.exitCode = result.status || 1;
    break;
  }
  console.log(`PASS: ${label}`);
}

if (!process.exitCode) {
  const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nCI security pipeline passed: ${steps.length} steps in ${durationSeconds}s`);
}
