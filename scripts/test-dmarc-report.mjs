import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import {
  parseDmarcReport,
  parseDmarcReportFile,
  parseXml,
  readZipEntries,
  summarizeDmarcReport
} from '../server/dmarc-report.mjs';
import { parseDmarcTxt, parseSpfTxt, suggestDmarcRecord } from '../server/domain-email.mjs';

/* ── Build a ZIP in memory so the test needs no fixture files ─────────────── */

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(name, content) {
  const data = Buffer.from(content, 'utf8');
  const compressed = deflateRawSync(data);
  const nameBuffer = Buffer.from(name, 'utf8');
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuffer.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuffer.length, 28);
  central.writeUInt32LE(0, 42);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + nameBuffer.length, 12);
  // Offset of the central directory: right after the local entry and its data.
  eocd.writeUInt32LE(local.length + nameBuffer.length + compressed.length, 16);

  return Buffer.concat([local, nameBuffer, compressed, central, nameBuffer, eocd]);
}

/* ── A realistic aggregate report ────────────────────────────────────────── */

const REPORT_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<feedback>
  <version>1.0</version>
  <report_metadata>
    <org_name>google.com</org_name>
    <email>noreply-dmarc-support@google.com</email>
    <report_id>15009049095792059605</report_id>
    <date_range><begin>1792886400</begin><end>1792972799</end></date_range>
  </report_metadata>
  <policy_published>
    <domain>norat.click</domain>
    <adkim>r</adkim><aspf>r</aspf><p>none</p><sp>none</sp><pct>100</pct><np>none</np>
  </policy_published>
  <record>
    <row>
      <source_ip>165.173.182.52</source_ip>
      <count>1</count>
      <policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf></policy_evaluated>
    </row>
    <identifiers><header_from>norat.click</header_from></identifiers>
    <auth_results>
      <dkim><domain>norat.click</domain><result>pass</result><selector>zmail</selector></dkim>
      <spf><domain>norat.click</domain><result>pass</result></spf>
    </auth_results>
  </record>
</feedback>`;

/* ── XML parsing ─────────────────────────────────────────────────────────── */

const tree = parseXml(REPORT_XML);
assert.equal(tree.children[0].name, 'feedback');

const report = parseDmarcReport(REPORT_XML);
assert.equal(report.orgName, 'google.com');
assert.equal(report.reportId, '15009049095792059605');
assert.equal(report.policy.domain, 'norat.click');
assert.equal(report.policy.p, 'none');
assert.equal(report.policy.pct, '100');
assert.equal(report.dateRange.beginIso, '2026-10-25T00:00:00.000Z');
assert.equal(report.dateRange.endIso, '2026-10-25T23:59:59.000Z');
assert.equal(report.records.length, 1);
assert.equal(report.records[0].sourceIp, '165.173.182.52');
assert.equal(report.records[0].count, 1);
assert.equal(report.records[0].dkim, 'pass');
assert.equal(report.records[0].spf, 'pass');
assert.equal(report.records[0].dkimAuth.selector, 'zmail');
assert.equal(report.records[0].headerFrom, 'norat.click');

/* Entities and CDATA are decoded. */
const decoded = parseXml('<r><a>x &amp; y</a><b><![CDATA[<raw>]]></b></r>');
const decodedRoot = decoded.children[0];
assert.equal(decodedRoot.name, 'r');
assert.equal(decodedRoot.children[0].text, 'x & y');
assert.equal(decodedRoot.children[1].text, '<raw>');

/* ── XXE and entity expansion must be refused ────────────────────────────── */

const xxe = `<?xml version="1.0"?>
<!DOCTYPE feedback [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<feedback><version>&xxe;</version></feedback>`;
assert.throws(() => parseXml(xxe), (error) => error.code === 'DMARC_PARSE_FAILED');

const billionLaughs = `<?xml version="1.0"?>
<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;">]>
<feedback>&lol2;</feedback>`;
assert.throws(() => parseXml(billionLaughs), (error) => error.code === 'DMARC_PARSE_FAILED');

/* A DOCTYPE mention in text is enough to refuse the whole document. */
assert.throws(() => parseXml('<r><!DOCTYPE evil></r>'), (error) => error.code === 'DMARC_PARSE_FAILED');

/* Malformed documents fail closed instead of returning a partial tree. */
assert.throws(() => parseXml('<a><b></a>'), (error) => error.code === 'DMARC_PARSE_FAILED');
assert.throws(() => parseXml('<a>'), (error) => error.code === 'DMARC_PARSE_FAILED');
assert.throws(() => parseXml('not xml at all'), (error) => error.code === 'DMARC_PARSE_FAILED');

/* ── ZIP handling ────────────────────────────────────────────────────────── */

const zip = makeZip('google.com!example.com!1!2.xml', REPORT_XML);
const entries = readZipEntries(zip);
assert.equal(entries.length, 1);
assert.equal(entries[0].name, 'google.com!example.com!1!2.xml');
assert.equal(entries[0].data.toString('utf8'), REPORT_XML);

const fromZip = parseDmarcReportFile(zip);
assert.equal(fromZip.policy.domain, 'norat.click');
assert.equal(fromZip.records[0].sourceIp, '165.173.182.52');

/* A file that is not a ZIP must be refused, not crash. */
assert.throws(() => readZipEntries(Buffer.from('not a zip')), (error) => error.code === 'DMARC_PARSE_FAILED');
/* A ZIP without an XML report must be refused. */
assert.throws(() => parseDmarcReportFile(makeZip('readme.txt', 'hello')), (error) => error.code === 'DMARC_PARSE_FAILED');
/* A ZIP holding a non-report XML must be refused. */
assert.throws(() => parseDmarcReportFile(makeZip('other.xml', '<html></html>')), (error) => error.code === 'DMARC_PARSE_FAILED');

/* ── Summary and escalation logic ────────────────────────────────────────── */

const summary = summarizeDmarcReport(report);
assert.equal(summary.totalRecords, 1);
assert.equal(summary.totalMessages, 1);
assert.equal(summary.aligned, 1);
assert.equal(summary.failing, 0);
assert.equal(summary.verdict, 'aligned');
assert.equal(summary.canEscalate, true);
assert.equal(summary.suggestedPolicy, 'quarantine');

/* One alignment failing is only partially aligned, not a total failure. */
const dkimFails = summarizeDmarcReport(parseDmarcReport(REPORT_XML.replace('<dkim>pass</dkim>', '<dkim>fail</dkim>')));
assert.equal(dkimFails.spfOnly, 1);
assert.equal(dkimFails.failing, 0);
assert.equal(dkimFails.verdict, 'partial');
assert.equal(dkimFails.canEscalate, false);

const spfFails = summarizeDmarcReport(parseDmarcReport(REPORT_XML.replace('<spf>pass</spf>', '<spf>fail</spf>')));
assert.equal(spfFails.dkimOnly, 1);
assert.equal(spfFails.failing, 0);
assert.equal(spfFails.verdict, 'partial');
assert.equal(spfFails.canEscalate, false);

/* Only when both alignments fail is the record a total failure. */
const bothFail = summarizeDmarcReport(parseDmarcReport(
  REPORT_XML.replace('<dkim>pass</dkim>', '<dkim>fail</dkim>').replace('<spf>pass</spf>', '<spf>fail</spf>')
));
assert.equal(bothFail.failing, 1);
assert.equal(bothFail.verdict, 'failing');
assert.equal(bothFail.canEscalate, false);
assert.equal(bothFail.suggestedPolicy, 'none');

const empty = summarizeDmarcReport(parseDmarcReport('<feedback><record></record></feedback>'));
assert.equal(empty.verdict, 'no-records');
assert.equal(empty.canEscalate, false);

/* ── DMARC and SPF record parsing ────────────────────────────────────────── */

const dmarc = parseDmarcTxt('v=DMARC1; p=none; rua=mailto:a@example.com,mailto:b@example.com; sp=none; adkim=r; aspf=r');
assert.equal(dmarc.valid, true);
assert.equal(dmarc.p, 'none');
assert.equal(dmarc.rua.length, 2);
assert.equal(dmarc.rua[0], 'mailto:a@example.com');

/* An unknown tag is ignored rather than corrupting the parse. */
const dmarcExtra = parseDmarcTxt('v=DMARC1; p=reject; unknown=zz; pct=50');
assert.equal(dmarcExtra.p, 'reject');
assert.equal(dmarcExtra.pct, '50');

/* A record that is not DMARC is invalid, not a partial parse. */
assert.equal(parseDmarcTxt('some other txt record').valid, false);
assert.equal(parseDmarcTxt('').valid, false);

const spf = parseSpfTxt('v=spf1 include:zohomail.com include:_spf.google.com ip4:1.2.3.4 ~all');
assert.equal(spf.valid, true);
assert.equal(spf.includes.length, 2);
assert.equal(spf.ip4[0], '1.2.3.4');
assert.equal(spf.mechanism, 'softfail');
assert.equal(parseSpfTxt('v=spf1 -all').mechanism, 'fail');
assert.equal(parseSpfTxt('not spf').valid, false);

/* ── Suggested record ────────────────────────────────────────────────────── */

const suggestion = suggestDmarcRecord({ domain: 'norat.click', rua: ['mailto:norat22022012@gmail.com'], policy: 'quarantine' });
assert.equal(suggestion.name, '_dmarc.norat.click');
assert.equal(suggestion.type, 'TXT');
assert.match(suggestion.value, /^v=DMARC1;/);
assert.match(suggestion.value, /p=quarantine/);
assert.match(suggestion.value, /rua=mailto:norat22022012@gmail\.com/);
assert.match(suggestion.value, /pct=100/);
assert.throws(() => suggestDmarcRecord({ domain: 'x.com', policy: 'banana' }));

/* ── A ZIP bomb must be refused, not inflated ────────────────────────────── */

/* The uncompressed size in the archive header is attacker controlled, so the
   inflate itself has to be bounded. */
function bombZip() {
  const bomb = Buffer.alloc(52 * 1024 * 1024, 0x41);
  const compressed = deflateRawSync(bomb);
  const nameBuffer = Buffer.from('r.xml', 'utf8');
  const crc = crc32(bomb);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(8, 8);
  local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(10, 22);            // lies about the inflated size
  local.writeUInt16LE(nameBuffer.length, 26); local.writeUInt16LE(0, 28);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(10, 24);          // lies about the inflated size
  central.writeUInt16LE(nameBuffer.length, 28); central.writeUInt32LE(0, 42);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + nameBuffer.length, 12);
  eocd.writeUInt32LE(local.length + nameBuffer.length + compressed.length, 16);
  return Buffer.concat([local, nameBuffer, compressed, central, nameBuffer, eocd]);
}

assert.throws(
  () => readZipEntries(bombZip()),
  (error) => error.code === 'DMARC_PARSE_FAILED',
  'a ZIP that lies about its inflated size must be refused'
);

/* ── An out-of-range character reference must fail like any other parse error ── */

assert.throws(
  () => parseXml('<r>&#999999999;</r>'),
  (error) => error.code === 'DMARC_PARSE_FAILED',
  'an out-of-range character reference must not throw a raw RangeError'
);
assert.throws(
  () => parseXml('<r>&#x110000;</r>'),
  (error) => error.code === 'DMARC_PARSE_FAILED'
);

/* ── A bare XML file must be accepted, not treated as a ZIP ──────────────── */

const xmlBuffer = Buffer.from(REPORT_XML, 'utf8');
const fromXmlBuffer = parseDmarcReportFile(xmlBuffer);
assert.equal(fromXmlBuffer.policy.domain, 'norat.click');
assert.equal(fromXmlBuffer.records[0].sourceIp, '165.173.182.52');
assert.equal(parseDmarcReportFile(REPORT_XML).policy.domain, 'norat.click');

/* Something that is neither an archive nor XML must be refused. */
assert.throws(
  () => parseDmarcReportFile(Buffer.from('not a report at all', 'utf8')),
  (error) => error.code === 'DMARC_PARSE_FAILED'
);

/* ── The CLI must exit non-zero when a record failed alignment ───────────── */

/* One alignment failed, so the record is not aligned: the CLI must exit 1. */
const partialXml = REPORT_XML
  .replace('<dkim>pass</dkim>', '<dkim>fail</dkim>')
  .replace('<spf>pass</spf>', '<spf>pass</spf>');
const reportDir = mkdtempSync(join(tmpdir(), 'sky-dmarc-'));
const reportPath = join(reportDir, 'partial.xml');
writeFileSync(reportPath, partialXml, 'utf8');
const cli = spawnSync(process.execPath, ['scripts/check-dmarc-report.mjs', reportPath], { encoding: 'utf8' });
assert.equal(cli.status, 1, 'a record with one failed alignment must exit 1');

console.log('DMARC report parsing and domain policy checks: OK');
