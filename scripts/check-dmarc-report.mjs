#!/usr/bin/env node
/**
 * check-dmarc-report.mjs
 *
 * Read a DMARC aggregate report (the ZIP Google emails you, or the XML inside
 * it) and print what the report says about mail alignment.
 *
 *   node scripts/check-dmarc-report.mjs ~/Downloads/google.com!example.com!1!2.zip
 *   node scripts/check-dmarc-report.mjs report.xml
 *   cat report.zip | node scripts/check-dmarc-report.mjs -
 *
 * Exit code 0 when every record is aligned, 1 when a record failed alignment
 * or the report cannot be parsed.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseDmarcReportFile, summarizeDmarcReport } from '../server/dmarc-report.mjs';

const args = process.argv.slice(2);
const target = args.find((arg) => !arg.startsWith('-')) || '';

function readInput(path) {
  if (path === '-') return readFileSync(0);
  return readFileSync(path);
}

if (!target) {
  console.error('Usage: node scripts/check-dmarc-report.mjs <report.zip|report.xml>');
  console.error('       node scripts/check-dmarc-report.mjs -            (read from stdin)');
  process.exit(2);
}

let report;
try {
  report = parseDmarcReportFile(readInput(target));
} catch (error) {
  console.error(`Could not read the report: ${error.message}`);
  process.exit(1);
}

const summary = summarizeDmarcReport(report);
const label = target === '-' ? 'stdin' : basename(target);

console.log(`DMARC aggregate report — ${label}`);
console.log('');
console.log(`  Reported by   : ${report.orgName || 'unknown'}${report.email ? ` <${report.email}>` : ''}`);
console.log(`  Report id     : ${report.reportId || 'unknown'}`);
console.log(`  Date range    : ${report.dateRange.beginIso || '?'} → ${report.dateRange.endIso || '?'}`);
console.log(`  Domain        : ${report.policy.domain || 'unknown'}`);
console.log(`  Published DMARC: p=${report.policy.p || '?'} sp=${report.policy.sp || '?'} pct=${report.policy.pct || '100'} adkim=${report.policy.adkim || 'r'} aspf=${report.policy.aspf || 'r'}`);
console.log('');

if (!report.records.length) {
  console.log('  No records in this report: no mail reached the reporting organisation.');
} else {
  console.log(`  Records       : ${summary.totalRecords} (${summary.totalMessages} message${summary.totalMessages === 1 ? '' : 's'})`);
  if (summary.malformed) console.log(`  Malformed     : ${summary.malformed}`);
  console.log(`  Fully aligned : ${summary.aligned}`);
  if (summary.dkimOnly) console.log(`  DKIM only     : ${summary.dkimOnly}`);
  if (summary.spfOnly) console.log(`  SPF only      : ${summary.spfOnly}`);
  if (summary.failing) console.log(`  Failed        : ${summary.failing}`);
  if (summary.quarantined) console.log(`  Quarantined   : ${summary.quarantined}`);
  if (summary.rejected) console.log(`  Rejected      : ${summary.rejected}`);
  console.log(`  Source IPs    : ${summary.sourceIps.join(', ') || 'n/a'}`);
  console.log('');
  for (const record of report.records) {
    const verdict = record.dkim === 'pass' && record.spf === 'pass' ? 'aligned' : 'NOT ALIGNED';
    console.log(`  · ${record.sourceIp} (${record.count}) — ${verdict}`);
    console.log(`      dkim=${record.dkim} spf=${record.spf} disposition=${record.disposition || 'none'} header_from=${record.headerFrom || 'n/a'}`);
    if (record.dkimAuth.selector) console.log(`      dkim auth: ${record.dkimAuth.domain || 'n/a'} result=${record.dkimAuth.result || 'n/a'} selector=${record.dkimAuth.selector}`);
    if (record.spfAuth.domain) console.log(`      spf auth : ${record.spfAuth.domain || 'n/a'} result=${record.spfAuth.result || 'n/a'}`);
  }
}

console.log('');
console.log(`  Verdict       : ${summary.verdict}`);
if (summary.canEscalate && report.policy.p === 'none') {
  console.log(`  → Alignment is clean. The policy can move from p=none to p=${summary.suggestedPolicy}.`);
  console.log(`    Run: node scripts/audit-domain-email.mjs ${report.policy.domain} --suggest`);
} else if (!summary.canEscalate) {
  console.log('  → Some messages did not align. Fix the failing senders before escalating the policy.');
}
console.log('');

/* The contract above says: 0 only when every record is aligned. A record that
   failed one of the two alignments is a partial verdict and must exit 1 too. */
const fullyAligned = summary.verdict === 'aligned' || summary.verdict === 'no-records';
process.exit(fullyAligned ? 0 : 1);
