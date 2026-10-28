import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ADSENSE_CRAWLER_TOKENS,
  ALL_GOOGLE_CRAWLER_TOKENS,
  ROBOTS_ALLOWED_TOKENS,
  crawlerKind,
  isAdsenseCrawler,
  isGoogleCrawler,
} from '../server/adsense-crawler.mjs';

/* ── 1. Detection behaves for the real user agent strings ────────────────── */

assert.equal(isAdsenseCrawler('Mediapartners-Google'), true);
assert.equal(isAdsenseCrawler('Mediapartners-Google/2.1; +http://www.google.com/bot.html'), true);
assert.equal(
  isAdsenseCrawler('Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.96 Mobile Safari/537.36 (compatible; Mediapartners-Google/2.1; +http://www.google.com/bot.html)'),
  true
);
assert.equal(isAdsenseCrawler('Google-Display-Ads-Bot'), true);
assert.equal(isAdsenseCrawler('AdsBot-Google (+http://www.google.com/adsbot.html)'), true);
assert.equal(
  isAdsenseCrawler('Mozilla/5.0 (Linux; Android 6.0.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0 Mobile Safari/537.36 (compatible; AdsBot-Google-Mobile; +http://www.google.com/mobile/adsbot.html)'),
  true
);

assert.equal(isGoogleCrawler('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), true);
assert.equal(isGoogleCrawler('Google-InspectionTool/1.0'), true);
assert.equal(isGoogleCrawler('Storebot-Google/1.0'), true);

assert.equal(isAdsenseCrawler('Mozilla/5.0 (Windows NT 10.0; Win64; x64) curl/8.5.0'), false);
assert.equal(isGoogleCrawler('Mozilla/5.0 (Windows NT 10.0; Win64; x64) curl/8.5.0'), false);
assert.equal(isAdsenseCrawler(''), false);
assert.equal(isAdsenseCrawler(undefined), false);

assert.equal(crawlerKind('Mediapartners-Google'), 'adsense');
assert.equal(crawlerKind('Googlebot/2.1'), 'google');
assert.equal(crawlerKind('curl/8.5.0'), null);

/* An ad crawler must never be classified as a plain search crawler. */
for (const token of ADSENSE_CRAWLER_TOKENS) {
  assert.equal(isGoogleCrawler(token), false, `${token} must not be treated as a search crawler`);
}

/* ── 2. The browser copy of the token list must not drift ─────────────────── */

const consentGate = readFileSync('consent-gate.js', 'utf8');
const gateTokens = [...consentGate.matchAll(/'([A-Za-z-]*Google[A-Za-z-]*)'/g)].map((match) => match[1]);
assert.deepEqual(
  [...new Set(gateTokens)].sort(),
  [...ADSENSE_CRAWLER_TOKENS].sort(),
  'consent-gate.js crawler tokens must match server/adsense-crawler.mjs'
);
assert.match(consentGate, /isCrawler/, 'consent-gate.js must detect crawlers');
assert.match(
  consentGate,
  /else if \(isCrawler\) publish\('granted', 'non-personalized'\)/,
  'consent-gate.js must resolve consent for Google ad crawlers'
);

/* ── 3. robots.txt must let every ad crawler read the site ────────────────── */

const robots = readFileSync('robots.txt', 'utf8');
for (const token of ROBOTS_ALLOWED_TOKENS) {
  const group = new RegExp(`User-agent:\\s*${token}\\s*\\nAllow:\\s*/`, 'i');
  assert.match(robots, group, `robots.txt must allow ${token}`);
}
for (const token of ADSENSE_CRAWLER_TOKENS) {
  assert.ok(ROBOTS_ALLOWED_TOKENS.includes(token), `${token} must be allowed by robots.txt`);
}
assert.doesNotMatch(
  robots,
  /User-agent:\s*Mediapartners-Google\s*\nDisallow:\s*\//i,
  'robots.txt must never disallow the AdSense crawler'
);
assert.match(robots, /Sitemap:\s*\S+/, 'robots.txt must reference the sitemap');

/* ── 4. The ad unit must be present in the served markup ─────────────────── */

const html = readFileSync('index.html', 'utf8');
assert.match(html, /class="adsbygoogle"/, 'index.html must contain the adsbygoogle ad unit');
assert.match(html, /data-ad-client="ca-pub-[0-9]+"/, 'index.html ad unit must carry a publisher id');
assert.match(html, /SKY_ADSENSE_SLOT:START/, 'index.html must keep the ad slot marker for the build');
assert.doesNotMatch(
  html,
  /data-ad-slot="[^"]+"[\s\S]{0,400}data-ad-slot="[^"]+"/,
  'index.html must contain exactly one ad unit'
);

/* ── 5. The crawler must be able to reach the ad library ─────────────────── */

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
const csp = vercel.headers.flatMap((entry) => entry.headers).find((header) => header.key === 'Content-Security-Policy')?.value || '';
assert.match(csp, /pagead2\.googlesyndication\.com/, 'CSP must allow the AdSense library');
assert.match(csp, /securepubads\.g\.doubleclick\.net/, 'CSP must allow Google Publisher Tags');
assert.match(csp, /doubleclick\.net/, 'CSP must allow ad frames');

const adsTxt = readFileSync('ads.txt', 'utf8');
assert.match(adsTxt, /google\.com,\s*pub-[0-9]+/, 'ads.txt must authorize the publisher id');

console.log('AdSense crawler access checks: OK');
