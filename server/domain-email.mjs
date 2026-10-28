/**
 * Email domain audit: SPF, DKIM and DMARC over DNS.
 *
 * Used by scripts/audit-domain-email.mjs to answer one question: "is the
 * mail domain configured well enough to move from DMARC monitoring to
 * enforcement?"
 *
 * DNS is queried over HTTPS (DNS-over-HTTPS) so no extra dependency and no
 * local resolver is needed.
 */

const DOH_RESOLVERS = [
  { url: 'https://dns.google/resolve', json: true },
  { url: 'https://cloudflare-dns.com/dns-query', json: true }
];

const RECORD_TYPES = { TXT: 'TXT', MX: 'MX', NS: 'NS', CNAME: 'CNAME' };

/**
 * Resolve a DNS record.
 * @param {string} name
 * @param {'TXT'|'MX'|'NS'|'CNAME'} type
 * @returns {Promise<{ status: number, answers: string[] }>}
 */
export async function resolveDns(name, type = 'TXT') {
  const recordType = RECORD_TYPES[type] || type;
  let lastError = null;
  for (const resolver of DOH_RESOLVERS) {
    try {
      const url = `${resolver.url}?name=${encodeURIComponent(name)}&type=${recordType}`;
      const response = await fetch(url, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) { lastError = new Error(`HTTP ${response.status}`); continue; }
      const payload = await response.json();
      const answers = (payload.Answer || [])
        .map((answer) => answer.data)
        .map((data) => (typeof data === 'string' ? data.replace(/^"|"$/g, '').replace(/\\"/g, '"') : ''))
        .filter(Boolean);
      return { status: payload.Status, answers };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`DNS lookup for ${name} failed: ${lastError ? lastError.message : 'unknown error'}`);
}

/* ── DMARC ───────────────────────────────────────────────────────────────── */

const DMARC_TAGS = ['v', 'p', 'sp', 'pct', 'adkim', 'aspf', 'rua', 'ruf', 'fo', 'rf', 'np'];

/**
 * Parse a DMARC TXT record into its tags.
 * @param {string} txt
 */
export function parseDmarcTxt(txt) {
  const value = String(txt || '').trim();
  const result = { version: null, p: null, sp: null, pct: null, adkim: null, aspf: null, rua: [], ruf: [], fo: null, rf: null, np: null, raw: value, valid: false };
  if (!/^v=DMARC1\b/i.test(value)) return result;
  for (const part of value.split(';')) {
    const chunk = part.trim();
    if (!chunk) continue;
    const separator = chunk.indexOf('=');
    if (separator === -1) continue;
    const tag = chunk.slice(0, separator).trim().toLowerCase();
    const tagValue = chunk.slice(separator + 1).trim();
    if (!DMARC_TAGS.includes(tag)) continue;
    if (tag === 'rua' || tag === 'ruf') result[tag].push(...tagValue.split(',').map((item) => item.trim()).filter(Boolean));
    else if (tag === 'v') result.version = tagValue;
    else result[tag] = tagValue;
  }
  result.valid = Boolean(result.version && result.p);
  return result;
}

/* ── SPF ─────────────────────────────────────────────────────────────────── */

/**
 * Parse an SPF record.
 * @param {string} txt
 */
export function parseSpfTxt(txt) {
  const value = String(txt || '').trim();
  const result = { raw: value, valid: false, mechanism: null, includes: [], redirects: [], ip4: [], ip6: [], explanation: null, count: 0 };
  if (!/^v=spf1\b/i.test(value)) return result;
  const terms = value.split(/\s+/).slice(1);
  for (const term of terms) {
    const lower = term.toLowerCase();
    if (lower.endsWith('all')) {
      if (lower === '~all') result.mechanism = 'softfail';
      else if (lower === '-all') result.mechanism = 'fail';
      else if (lower === '?all') result.mechanism = 'neutral';
      else result.mechanism = lower.replace('all', '');
    } else if (lower.startsWith('include:')) result.includes.push(lower.slice(8));
    else if (lower.startsWith('redirect=')) result.redirects.push(lower.slice(9));
    else if (lower.startsWith('ip4:')) result.ip4.push(lower.slice(4));
    else if (lower.startsWith('ip6:')) result.ip6.push(lower.slice(6));
  }
  result.count = result.includes.length + result.redirects.length + result.ip4.length + result.ip6.length;
  result.valid = result.count > 0;
  return result;
}

/* ── Audit ───────────────────────────────────────────────────────────────── */

/**
 * Audit the mail setup of a domain.
 *
 * @param {string} domain
 * @param {{ dkimSelectors?: string[], rua?: string[] }} [options]
 */
export async function auditEmailDomain(domain, options = {}) {
  const host = String(domain || '').trim().replace(/\.$/, '');
  if (!host || !/^[a-z0-9.-]+$/i.test(host)) throw new Error(`Invalid domain: ${domain}`);

  const selectors = options.dkimSelectors && options.dkimSelectors.length
    ? options.dkimSelectors
    : ['zmail', 'default', 'google', 'selector1', 'selector2', 'mail', 'dkim'];

  const [mx, spfTxt, dmarcTxt] = await Promise.all([
    resolveDns(host, 'MX').catch(() => ({ status: -1, answers: [] })),
    resolveDns(host, 'TXT').catch(() => ({ status: -1, answers: [] })),
    resolveDns(`_dmarc.${host}`, 'TXT').catch(() => ({ status: -1, answers: [] })),
  ]);

  const spfRecords = spfTxt.answers.filter((answer) => /^v=spf1\b/i.test(answer));
  const dmarcRecords = dmarcTxt.answers.filter((answer) => /^v=DMARC1\b/i.test(answer));

  const dkim = [];
  const revokedDkim = [];
  for (const selector of selectors) {
    const records = await resolveDns(`${selector}._domainkey.${host}`, 'TXT').catch(() => ({ status: -1, answers: [] }));
    for (const answer of records.answers) {
      if (!/^v=DKIM1\b/i.test(answer)) continue;
      /* `v=DKIM1; p=` carries an empty key: the key was revoked. Such a record
         is not a working signature and must not count as DKIM coverage. */
      const key = answer.match(/(?:^|;)\s*p=([^;]*)/i);
      if (key && key[1].trim()) dkim.push({ selector, record: answer });
      else revokedDkim.push({ selector, record: answer });
    }
  }

  const dmarc = dmarcRecords.length ? parseDmarcTxt(dmarcRecords[0]) : parseDmarcTxt('');
  const spf = spfRecords.length ? parseSpfTxt(spfRecords[0]) : parseSpfTxt('');

  const problems = [];
  if (!spf.valid) problems.push('No usable SPF record on the apex domain.');
  else if (spf.mechanism === 'softfail') problems.push('SPF ends with ~all (softfail). Use -all once sending is stable.');
  if (spfRecords.length > 1) problems.push(`Found ${spfRecords.length} SPF records. Only one is allowed.`);
  if (!dmarc.valid) problems.push('No DMARC record found at _dmarc.' + host + '.');
  if (dmarc.valid && dmarc.p === 'none') problems.push('DMARC is monitoring only (p=none). Escalate to quarantine, then reject.');
  if (dmarc.valid && dmarc.pct && Number(dmarc.pct) < 100) problems.push(`DMARC pct is ${dmarc.pct}. Raise it to 100 once the policy is stable.`);
  if (!dkim.length) problems.push('No DKIM key with a public key found for the common selectors.');

  return {
    domain: host,
    mx: mx.answers,
    spf,
    spfRecords,
    dmarc,
    dmarcRecords,
    dkim,
    revokedDkim,
    problems,
    healthy: problems.length === 0
  };
}

/**
 * Build a DMARC TXT record.
 *
 * @param {{ domain: string, rua?: string[], policy?: string, pct?: number, adkim?: string, aspf?: string, sp?: string, ruf?: string[] }} options
 */
export function suggestDmarcRecord(options = {}) {
  const domain = String(options.domain || '').trim().replace(/\.$/, '');
  if (!domain) throw new Error('A domain is required');
  const policy = options.policy || 'quarantine';
  if (!['none', 'quarantine', 'reject'].includes(policy)) throw new Error(`Unsupported DMARC policy: ${policy}`);
  const rua = options.rua && options.rua.length ? options.rua : [`dmarc@${domain}`];
  const tags = [
    'v=DMARC1',
    `p=${policy}`,
    `rua=${rua.join(',')}`
  ];
  if (options.ruf && options.ruf.length) tags.push(`ruf=${options.ruf.join(',')}`);
  tags.push(`pct=${options.pct ?? 100}`);
  tags.push(`adkim=${options.adkim || 'r'}`);
  tags.push(`aspf=${options.aspf || 'r'}`);
  if (options.sp) tags.push(`sp=${options.sp}`);
  return { name: `_dmarc.${domain}`, type: 'TXT', value: tags.join('; ') };
}
