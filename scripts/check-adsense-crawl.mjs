#!/usr/bin/env node
/**
 * check-adsense-crawl.mjs
 *
 * Fetch the site the way Google's ad crawlers do and report what they see.
 *
 *   node scripts/check-adsense-crawl.mjs
 *   node scripts/check-adsense-crawl.mjs --url https://sky.norat.click
 *
 * Exits non-zero when a crawler would not be able to read the ad code, so it
 * can be used as a release gate or a post-deploy check.
 */
import { readFileSync } from 'node:fs';
import { ADSENSE_CRAWLER_TOKENS, ROBOTS_ALLOWED_TOKENS } from '../server/adsense-crawler.mjs';

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const index = args.indexOf(name);
  if (index !== -1 && args[index + 1]) return args[index + 1];
  const inline = args.find((value) => value.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
}

function siteUrl() {
  const explicit = argValue('--url', '');
  if (explicit) return explicit.replace(/\/$/, '');
  try {
    const env = readFileSync('env.js', 'utf8');
    const match = env.match(/PUBLIC_SITE_URL:\s*"([^"]+)"/);
    if (match) return match[1].replace(/\/$/, '');
  } catch {}
  return 'https://sky.norat.click';
}

const BASE = siteUrl();
const failures = [];
const notes = [];

function check(label, ok, detail) {
  const mark = ok ? 'OK  ' : 'FAIL';
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
}

async function fetchAs(userAgent, path) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'user-agent': userAgent, accept: 'text/html,*/*' },
    redirect: 'follow'
  });
  const body = await response.text();
  return { status: response.status, body, headers: response.headers };
}

console.log(`AdSense crawl check for ${BASE}\n`);

/* ── robots.txt ──────────────────────────────────────────────────────────── */

console.log('robots.txt');
const robots = await fetchAs('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', '/robots.txt');
check('reachable', robots.status === 200, `HTTP ${robots.status}`);
for (const token of ROBOTS_ALLOWED_TOKENS) {
  const allowed = new RegExp(`User-agent:\\s*${token}\\s*\\nAllow:\\s*/`, 'i').test(robots.body);
  const blocked = new RegExp(`User-agent:\\s*${token}\\s*\\nDisallow:\\s*/`, 'i').test(robots.body);
  check(`${token} allowed`, allowed && !blocked);
}

/* ── ads.txt ─────────────────────────────────────────────────────────────── */

console.log('\nads.txt');
const adsTxt = await fetchAs('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', '/ads.txt');
check('reachable', adsTxt.status === 200, `HTTP ${adsTxt.status}`);
check('authorizes a publisher', /google\.com,\s*pub-[0-9]+/.test(adsTxt.body));

/* ── the page, as each ad crawler sees it ────────────────────────────────── */

console.log('\nad code on the landing page');
for (const token of ADSENSE_CRAWLER_TOKENS) {
  const page = await fetchAs(token, '/');
  const hasUnit = /class="adsbygoogle"/.test(page.body);
  const client = page.body.match(/data-ad-client="(ca-pub-[0-9]+)"/);
  const slot = page.body.match(/data-ad-slot="([^"]*)"/);
  const slotFilled = Boolean(slot && slot[1]);
  console.log(`  ${token}`);
  check(`${token}: HTTP 200`, page.status === 200, `HTTP ${page.status}`);
  check(`${token}: ad unit present`, hasUnit);
  check(`${token}: publisher id present`, Boolean(client), client ? client[1] : 'missing');
  check(`${token}: slot id filled`, slotFilled, slotFilled ? slot[1] : 'empty — set ADSENSE_AD_SLOT');
  if (!slotFilled) {
    notes.push(`${token}: the ad unit has no slot id. Set ADSENSE_AD_SLOT in the build environment.`);
  }
}

/* ── verdict ─────────────────────────────────────────────────────────────── */

if (notes.length) {
  console.log('\nNotes:');
  for (const note of notes) console.log(`  - ${note}`);
}

console.log('');
if (failures.length) {
  console.error(`AdSense crawl check FAILED: ${failures.length} problem(s) found.`);
  process.exit(1);
}
console.log('AdSense crawl check passed: Google ad crawlers can read the ad code.');
