import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ROBOTS_ALLOWED_TOKENS } from '../server/adsense-crawler.mjs';

function parseEnvLocal(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    values[match[1]] = value;
  }
  return values;
}

/* robots.txt for Google crawlers.
   Mediapartners-Google, Google-Display-Ads-Bot, AdsBot-Google and
   AdsBot-Google-Mobile are special-case crawlers: Google documents that they
   ignore the global `User-agent: *` group and only honour rules addressed to
   their own token. Each one gets an explicit `Allow: /` group so the intent
   survives a future `Disallow` added to the `*` group.
   Without this, Google cannot read pages that carry ad tags and serves no ads
   for them. */
function robotsTxt(siteUrl) {
  const lines = ['# Google ad and search crawlers must be able to read pages that carry ad tags.'];
  for (const group of ROBOTS_ALLOWED_TOKENS) {
    lines.push(`User-agent: ${group}`, 'Allow: /', '');
  }
  lines.push('User-agent: *', 'Allow: /', '', `Sitemap: ${siteUrl}sitemap.xml`, '');
  return lines.join('\n');
}

const localEnv = process.env.VERCEL ? {} : parseEnvLocal('.env.local');
const env = { ...localEnv, ...process.env };
const vercelUrl = env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL;
const defaultSiteUrl = vercelUrl ? `https://${vercelUrl}/` : 'https://sky.norat.click/';
const siteUrl = (env.VITE_PUBLIC_SITE_URL || defaultSiteUrl).replace(/\/$/, '') + '/';
const adsensePublisherId = String(env.ADSENSE_PUBLISHER_ID || 'ca-pub-2855538220391010').trim();
const adsenseClient = /^ca-pub-/i.test(adsensePublisherId) ? adsensePublisherId : `ca-pub-${adsensePublisherId.replace(/^ca-pub-/i, '')}`;
const adsenseAdSlot = String(env.ADSENSE_AD_SLOT || '').trim();
const config = {
  PUBLIC_SITE_URL: siteUrl,
  API_BASE_URL: env.VITE_API_BASE_URL || '',
  SUPABASE_URL: env.VITE_SUPABASE_URL || '',
  SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY || '',
  SUPABASE_REDIRECT_URL: env.VITE_SUPABASE_REDIRECT_URL || siteUrl,
  TURNSTILE_SITE_KEY: env.VITE_TURNSTILE_SITE_KEY || '',
  ADSENSE_PUBLISHER_ID: adsenseClient,
  ADSENSE_AD_SLOT: adsenseAdSlot,
  NATIVE_OAUTH_REDIRECT_SCHEME: env.VITE_NATIVE_OAUTH_REDIRECT_SCHEME || 'com.norat02.skybird'
};

/* The ad unit is emitted as static markup so Google's ad crawlers can read the
   ad code without executing JavaScript. The block is regenerated from scratch
   on every build, which keeps the build idempotent: running it twice leaves
   the same result as running it once.
   When no slot id is configured the host stays hidden and the client removes
   the empty <ins> element, so no broken ad slot is ever published. */
const SLOT_BLOCK = /<!-- SKY_ADSENSE_SLOT:START -->[\s\S]*?<!-- SKY_ADSENSE_SLOT:END -->/;
function adSlotBlock() {
  const hidden = adsenseAdSlot ? '' : ' hidden';
  return `<!-- SKY_ADSENSE_SLOT:START -->
<!-- The ad unit is served as static markup so Google's ad crawlers can read it
     without executing JavaScript. scripts/generate-config.mjs rewrites this
     block on every build with the real publisher and slot ids. -->
<div id="skyAdHost" class="skyAdHost"${hidden}>
  <ins class="adsbygoogle" style="display:block" data-ad-client="${adsenseClient}" data-ad-slot="${adsenseAdSlot}" data-ad-format="auto" data-full-width-responsive="true"></ins>
</div>
<!-- SKY_ADSENSE_SLOT:END -->`;
}

const js = `// Generated at build time. Do not commit this file.\nwindow.SKY_ENV = ${JSON.stringify(config, null, 2)};\n`;
writeFileSync('env.js', js, 'utf8');
let html = readFileSync('index.html', 'utf8').replaceAll('https://sky.norat.click/', siteUrl);
html = SLOT_BLOCK.test(html) ? html.replace(SLOT_BLOCK, adSlotBlock()) : html;
writeFileSync('index.html', html, 'utf8');
writeFileSync('robots.txt', robotsTxt(siteUrl), 'utf8');
 writeFileSync('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${siteUrl}</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n  <url><loc>${siteUrl}privacy-policy.html</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>\n  <url><loc>${siteUrl}terms-of-use.html</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>\n  <url><loc>${siteUrl}game-guide.html</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>\n</urlset>\n`, 'utf8');
console.log(`Supabase runtime config generated (${config.SUPABASE_URL ? 'configured' : 'offline fallback'}); SEO URL: ${siteUrl}`);
console.log(`AdSense ad slot ${adsenseAdSlot ? `configured for ${adsenseClient}` : 'not configured — ad unit hidden'}`);

