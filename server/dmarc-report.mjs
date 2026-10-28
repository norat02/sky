/**
 * DMARC aggregate report parsing.
 *
 * Google delivers DMARC aggregate reports as a ZIP archive holding one XML
 * file, for example:
 *
 *   google.com!norat.click!1792886400!1792972799.zip
 *   └── google.com!norat.click!1792886400!1792972799.xml
 *
 * The XML follows the DMARC aggregate report schema. This module parses it
 * without any external dependency and without a general purpose XML parser.
 *
 * Security notes
 * --------------
 *   * No DOCTYPE and no entity declarations are accepted. That rules out XML
 *     external entity expansion (XXE) and the "billion laughs" expansion
 *     attack, because there is no entity table to expand.
 *   * Only the small XML subset the DMARC schema uses is supported: elements,
 *     attributes, text, CDATA, comments and the XML declaration.
 *   * Input size, nesting depth and node count are capped.
 *   * The ZIP reader only reads entries, never writes, and enforces the same
 *     size caps. It never extracts to disk.
 */
import zlib from 'node:zlib';

const MAX_XML_BYTES = 5 * 1024 * 1024;
const MAX_XML_DEPTH = 64;
const MAX_XML_NODES = 100_000;
const MAX_ZIP_ENTRIES = 64;
const MAX_ZIP_TOTAL_BYTES = 10 * 1024 * 1024;

/* ── Minimal strict XML parser ───────────────────────────────────────────── */

const DOCTYPE_OR_ENTITY = /<!(DOCTYPE|ENTITY)/i;

function fail(message) {
  const error = new Error(message);
  error.code = 'DMARC_PARSE_FAILED';
  throw error;
}

/**
 * Parse the XML subset used by DMARC reports into a plain object tree.
 * @param {string} text
 * @returns {{ name: string, attrs: Record<string,string>, children: any[], text: string }}
 */
export function parseXml(text) {
  if (typeof text !== 'string') fail('XML input must be a string');
  if (Buffer.byteLength(text, 'utf8') > MAX_XML_BYTES) fail('XML input exceeds the maximum allowed size');
  if (DOCTYPE_OR_ENTITY.test(text)) fail('DOCTYPE and ENTITY declarations are not allowed');

  let index = 0;
  let nodes = 0;
  const root = { name: '#document', attrs: {}, children: [], text: '' };
  const stack = [root];

  const readName = () => {
    const start = index;
    while (index < text.length && /[A-Za-z0-9_:.-]/.test(text[index])) index += 1;
    return text.slice(start, index);
  };

  const skipSpace = () => {
    while (index < text.length && /\s/.test(text[index])) index += 1;
  };

  const codePoint = (value) => {
    const point = Number(value);
    /* An out-of-range code point must fail through fail(), not through a raw
       RangeError, so every parse failure looks the same to the caller. */
    if (!Number.isInteger(point) || point < 0 || point > 0x10ffff) {
      fail(`Invalid character reference: &#${value};`);
    }
    return String.fromCodePoint(point);
  };
  const decodeEntities = (value) => value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => codePoint(code))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => codePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');

  while (index < text.length) {
    const lt = text.indexOf('<', index);
    if (lt === -1) {
      appendText(stack[stack.length - 1], decodeEntities(text.slice(index)));
      break;
    }
    if (lt > index) appendText(stack[stack.length - 1], decodeEntities(text.slice(index, lt)));
    index = lt;

    if (text.startsWith('<!--', index)) {
      const end = text.indexOf('-->', index + 4);
      if (end === -1) fail('Unterminated comment');
      index = end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', index)) {
      const end = text.indexOf(']]>', index + 9);
      if (end === -1) fail('Unterminated CDATA section');
      appendText(stack[stack.length - 1], text.slice(index + 9, end));
      index = end + 3;
      continue;
    }
    if (text.startsWith('<?', index)) {
      const end = text.indexOf('?>', index + 2);
      if (end === -1) fail('Unterminated processing instruction');
      index = end + 2;
      continue;
    }
    if (text.startsWith('</', index)) {
      index += 2;
      const name = readName();
      skipSpace();
      if (text[index] !== '>') fail('Malformed closing tag');
      index += 1;
      const open = stack.pop();
      if (!open || open === root) fail(`Unexpected closing tag: ${name}`);
      if (open.name !== name) fail(`Mismatched closing tag: expected ${open.name}, got ${name}`);
      stack[stack.length - 1].children.push(open);
      continue;
    }

    index += 1;
    const name = readName();
    if (!name) fail('Malformed element name');
    const node = { name, attrs: {}, children: [], text: '' };
    nodes += 1;
    if (nodes > MAX_XML_NODES) fail('XML document has too many nodes');
    for (;;) {
      skipSpace();
      if (index >= text.length) fail('Unterminated element');
      const char = text[index];
      if (char === '>') { index += 1; break; }
      if (char === '/') {
        if (text[index + 1] !== '>') fail('Malformed self-closing tag');
        index += 2;
        stack[stack.length - 1].children.push(node);
        node.selfClosed = true;
        break;
      }
      const attrName = readName();
      if (!attrName) fail('Malformed attribute name');
      skipSpace();
      if (text[index] !== '=') fail(`Malformed attribute: ${attrName}`);
      index += 1;
      skipSpace();
      const quote = text[index];
      if (quote !== '"' && quote !== "'") fail(`Unquoted attribute value: ${attrName}`);
      index += 1;
      const end = text.indexOf(quote, index);
      if (end === -1) fail('Unterminated attribute value');
      node.attrs[attrName] = decodeEntities(text.slice(index, end));
      index = end + 1;
    }
    if (!node.selfClosed) {
      stack.push(node);
      if (stack.length > MAX_XML_DEPTH) fail('XML document is nested too deeply');
    }
  }

  if (stack.length !== 1) fail('Unclosed element');
  /* Plain text, an empty document or a stray fragment is not XML. Failing here
     keeps the parser from silently returning an empty tree. */
  if (!root.children.length) fail('Not an XML document: no root element');
  return root;
}

function appendText(node, value) {
  if (!value) return;
  node.text += value;
}

/* ── Tree helpers ────────────────────────────────────────────────────────── */

function childrenNamed(node, name) {
  return node.children.filter((child) => child.name === name);
}

function childNamed(node, name) {
  return childrenNamed(node, name)[0] || null;
}

function textOf(node) {
  if (!node) return '';
  return node.text.trim();
}

function findPath(node, ...names) {
  let current = node;
  for (const name of names) {
    if (!current) return null;
    current = childNamed(current, name);
  }
  return current;
}

function pathText(node, ...names) {
  return textOf(findPath(node, ...names));
}

/* ── DMARC report mapping ────────────────────────────────────────────────── */

/**
 * Map a parsed DMARC aggregate report tree onto a plain object.
 */
export function mapDmarcReport(root) {
  const feedback = childNamed(root, 'feedback');
  if (!feedback) fail('Not a DMARC aggregate report: no <feedback> element');

  const metadata = childNamed(feedback, 'report_metadata');
  const policy = childNamed(feedback, 'policy_published');
  const begin = Number(pathText(metadata, 'date_range', 'begin'));
  const end = Number(pathText(metadata, 'date_range', 'end'));

  /* A <record> without a <row> carries no evaluation at all. It is malformed
     rather than a failure, so it is skipped instead of being counted as a
     message that failed alignment. */
  const rawRecords = childrenNamed(feedback, 'record');
  const malformed = rawRecords.filter((record) => !childNamed(record, 'row')).length;
  const records = rawRecords.filter((record) => childNamed(record, 'row')).map((record) => {
    const row = childNamed(record, 'row');
    const policyEvaluated = row ? childNamed(row, 'policy_evaluated') : null;
    const identifiers = childNamed(record, 'identifiers');
    const authResults = childNamed(record, 'auth_results');
    const dkimAuth = authResults ? childNamed(authResults, 'dkim') : null;
    const spfAuth = authResults ? childNamed(authResults, 'spf') : null;
    return {
      sourceIp: textOf(row ? childNamed(row, 'source_ip') : null),
      count: Number(textOf(row ? childNamed(row, 'count') : null)) || 0,
      disposition: textOf(policyEvaluated ? childNamed(policyEvaluated, 'disposition') : null),
      dkim: textOf(policyEvaluated ? childNamed(policyEvaluated, 'dkim') : null),
      spf: textOf(policyEvaluated ? childNamed(policyEvaluated, 'spf') : null),
      headerFrom: textOf(identifiers ? childNamed(identifiers, 'header_from') : null),
      dkimAuth: {
        domain: textOf(dkimAuth ? childNamed(dkimAuth, 'domain') : null),
        result: textOf(dkimAuth ? childNamed(dkimAuth, 'result') : null),
        selector: textOf(dkimAuth ? childNamed(dkimAuth, 'selector') : null)
      },
      spfAuth: {
        domain: textOf(spfAuth ? childNamed(spfAuth, 'domain') : null),
        result: textOf(spfAuth ? childNamed(spfAuth, 'result') : null)
      }
    };
  });

  return {
    orgName: pathText(metadata, 'org_name'),
    email: pathText(metadata, 'email'),
    extraContactInfo: pathText(metadata, 'extra_contact_info'),
    reportId: pathText(metadata, 'report_id'),
    dateRange: {
      begin,
      end,
      beginIso: Number.isFinite(begin) ? new Date(begin * 1000).toISOString() : null,
      endIso: Number.isFinite(end) ? new Date(end * 1000).toISOString() : null
    },
    policy: {
      domain: pathText(policy, 'domain'),
      adkim: pathText(policy, 'adkim'),
      aspf: pathText(policy, 'aspf'),
      p: pathText(policy, 'p'),
      sp: pathText(policy, 'sp'),
      pct: pathText(policy, 'pct'),
      np: pathText(policy, 'np')
    },
    records,
    malformed
  };
}

/**
 * Parse a DMARC aggregate report from XML text.
 */
export function parseDmarcReport(xmlText) {
  return mapDmarcReport(parseXml(xmlText));
}

/**
 * Summarise a parsed report and decide whether the published policy can be
 * escalated from monitoring (`p=none`) to enforcement.
 */
export function summarizeDmarcReport(report) {
  const totalMessages = report.records.reduce((sum, record) => sum + record.count, 0);
  const aligned = report.records.filter((record) => record.dkim === 'pass' && record.spf === 'pass');
  const dkimOnly = report.records.filter((record) => record.dkim === 'pass' && record.spf !== 'pass');
  const spfOnly = report.records.filter((record) => record.spf === 'pass' && record.dkim !== 'pass');
  const failing = report.records.filter((record) => record.dkim !== 'pass' && record.spf !== 'pass');
  const quarantined = report.records.filter((record) => record.disposition === 'quarantine');
  const rejected = report.records.filter((record) => record.disposition === 'reject');

  let verdict = 'aligned';
  if (!report.records.length) verdict = 'no-records';
  else if (failing.length) verdict = 'failing';
  else if (dkimOnly.length || spfOnly.length) verdict = 'partial';

  /* A policy may only move to quarantine or reject when every message in the
     report was aligned. Anything else would risk quarantining legitimate mail. */
  const canEscalate = report.records.length > 0 && failing.length === 0 && dkimOnly.length === 0 && spfOnly.length === 0;
  const suggestedPolicy = canEscalate ? 'quarantine' : report.policy.p || 'none';

  return {
    totalRecords: report.records.length,
    malformed: report.malformed || 0,
    totalMessages,
    aligned: aligned.length,
    dkimOnly: dkimOnly.length,
    spfOnly: spfOnly.length,
    failing: failing.length,
    quarantined: quarantined.length,
    rejected: rejected.length,
    verdict,
    canEscalate,
    suggestedPolicy,
    sourceIps: [...new Set(report.records.map((record) => record.sourceIp).filter(Boolean))]
  };
}

/* ── Minimal ZIP reader ──────────────────────────────────────────────────── */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/**
 * Read entries from a ZIP archive held in memory.
 * Only the "stored" (0) and "deflate" (8) compression methods are supported.
 * Entries are never written to disk.
 */
export function readZipEntries(buffer, { maxEntries = MAX_ZIP_ENTRIES, maxTotalBytes = MAX_ZIP_TOTAL_BYTES } = {}) {
  if (!Buffer.isBuffer(buffer)) fail('ZIP input must be a Buffer');
  if (buffer.length > MAX_ZIP_TOTAL_BYTES) fail('ZIP archive exceeds the maximum allowed size');

  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 22 - 65_535; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) { eocd = i; break; }
  }
  if (eocd === -1) fail('Not a ZIP archive: end of central directory not found');

  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (entryCount > maxEntries) fail(`ZIP archive holds more than ${maxEntries} entries`);

  const entries = [];
  let cursor = centralOffset;
  for (let i = 0; i < entryCount; i += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      fail('Malformed ZIP central directory');
    }
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    cursor += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith('/')) continue;
    if (uncompressedSize > maxTotalBytes) fail('ZIP entry exceeds the maximum allowed size');

    if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) fail('Malformed ZIP local header');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) fail('ZIP entry data is truncated');

    const raw = buffer.subarray(dataStart, dataEnd);
    let data;
    if (method === 0) {
      if (raw.length > maxTotalBytes) fail('ZIP entry exceeds the maximum allowed size');
      data = Buffer.from(raw);
    } else if (method === 8) {
      /* The declared uncompressed size comes from the archive header and is
         therefore attacker controlled. The inflate itself must be bounded, or
         a small archive can expand into an arbitrarily large buffer. */
      try {
        data = zlib.inflateRawSync(raw, { maxOutputLength: maxTotalBytes });
      } catch (error) {
        fail(`ZIP entry could not be decompressed within the size limit: ${error.message}`);
      }
    } else fail(`Unsupported ZIP compression method: ${method}`);

    if (data.length > maxTotalBytes) fail('ZIP entry exceeds the maximum allowed size');
    entries.push({ name, data });
  }
  return entries;
}

/**
 * Parse a DMARC aggregate report from a ZIP archive or from raw XML.
 * @param {Buffer|string} input
 */
const ZIP_MAGIC = [0x04034b50, 0x06054b50, 0x08074b50];

function looksLikeZip(buffer) {
  return buffer.length >= 4 && ZIP_MAGIC.includes(buffer.readUInt32LE(0));
}

export function parseDmarcReportFile(input) {
  if (typeof input === 'string') return parseDmarcReport(input);
  if (looksLikeZip(input)) {
    const entries = readZipEntries(input);
    const xml = entries.find((entry) => entry.name.toLowerCase().endsWith('.xml'));
    if (!xml) fail('The archive does not contain an XML report');
    return parseDmarcReport(xml.data.toString('utf8'));
  }
  /* Not an archive: treat the payload as a bare XML document. */
  const text = input.toString('utf8');
  if (!/^\s*<\?xml|^\s*</.test(text)) fail('Not a DMARC report: expected a ZIP archive or an XML document');
  return parseDmarcReport(text);
}
