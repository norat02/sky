#!/usr/bin/env node
/**
 * audit-domain-email.mjs
 *
 * Check the mail setup of a domain over DNS and report what can be improved.
 *
 *   node scripts/audit-domain-email.mjs norat.click
 *   node scripts/audit-domain-email.mjs norat.click --suggest
 *
 * --suggest prints the DMARC record to publish, escalating the policy only
 * when SPF and DKIM are already healthy.
 */
import { auditEmailDomain, suggestDmarcRecord } from '../server/domain-email.mjs';

const args = process.argv.slice(2);
const domain = args.find((arg) => !arg.startsWith('-')) || '';
const suggest = args.includes('--suggest');

if (!domain) {
  console.error('Usage: node scripts/audit-domain-email.mjs <domain> [--suggest]');
  process.exit(2);
}

let audit;
try {
  audit = await auditEmailDomain(domain);
} catch (error) {
  console.error(`Audit failed: ${error.message}`);
  process.exit(1);
}

console.log(`Email domain audit — ${audit.domain}`);
console.log('');

console.log('MX');
if (audit.mx.length) for (const record of audit.mx) console.log(`  ${record}`);
else console.log('  (none found)');

console.log('');
console.log('SPF');
if (audit.spfRecords.length) {
  for (const record of audit.spfRecords) console.log(`  ${record}`);
  console.log(`  includes : ${audit.spf.includes.join(', ') || 'none'}`);
  console.log(`  all      : ${audit.spf.mechanism || 'not set'}`);
} else {
  console.log('  (no SPF record)');
}

console.log('');
console.log('DKIM');
if (audit.dkim.length) for (const entry of audit.dkim) console.log(`  ${entry.selector}._domainkey.${audit.domain}  (active)`);
else console.log('  (no active DKIM key found for the common selectors)');
if (audit.revokedDkim.length) {
  console.log('  revoked (empty key):');
  for (const entry of audit.revokedDkim) console.log(`    ${entry.selector}._domainkey.${audit.domain}`);
}

console.log('');
console.log('DMARC');
if (audit.dmarcRecords.length) {
  for (const record of audit.dmarcRecords) console.log(`  ${record}`);
  console.log(`  p=${audit.dmarc.p} sp=${audit.dmarc.sp || 'none'} pct=${audit.dmarc.pct || '100'} adkim=${audit.dmarc.adkim || 'r'} aspf=${audit.dmarc.aspf || 'r'}`);
  console.log(`  rua=${audit.dmarc.rua.join(', ') || 'none'} ruf=${audit.dmarc.ruf.join(', ') || 'none'}`);
} else {
  console.log('  (no DMARC record)');
}

console.log('');
if (audit.problems.length) {
  console.log('Problems:');
  for (const problem of audit.problems) console.log(`  - ${problem}`);
} else {
  console.log('No problems found.');
}

if (suggest) {
  const rua = audit.dmarc.rua.length ? audit.dmarc.rua : undefined;
  const current = audit.dmarc.p || 'none';
  const next = current === 'none' ? 'quarantine' : current === 'quarantine' ? 'reject' : current;
  const record = suggestDmarcRecord({
    domain: audit.domain,
    rua,
    policy: next,
    pct: 100,
    adkim: audit.dmarc.adkim || 'r',
    aspf: audit.dmarc.aspf || 'r',
    sp: audit.dmarc.sp || undefined
  });
  console.log('');
  console.log(`Suggested DMARC record (${current} → ${next}):`);
  console.log('');
  console.log(`  Name  : ${record.name}`);
  console.log(`  Type  : ${record.type}`);
  console.log(`  Value : ${record.value}`);
  console.log('');
  console.log('Publish it, wait for the report interval to pass, then escalate again.');
}

console.log('');
process.exit(audit.problems.length ? 1 : 0);
