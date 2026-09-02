import { readFileSync, writeFileSync } from 'node:fs';

const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
const defaultSiteUrl = vercelUrl ? `https://${vercelUrl}/` : 'https://norat02.github.io/sky/';
const siteUrl = (process.env.PUBLIC_SITE_URL || defaultSiteUrl).replace(/\/$/, '') + '/';
const config = {
  PUBLIC_SITE_URL: siteUrl,
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  SUPABASE_REDIRECT_URL: process.env.SUPABASE_REDIRECT_URL || ''
};

const js = `// Generated at build time. Do not commit this file.\nwindow.SKY_CONFIG = ${JSON.stringify(config, null, 2)};\n`;
writeFileSync('config.js', js, 'utf8');
const html = readFileSync('index.html', 'utf8').replaceAll('https://norat02.github.io/sky/', siteUrl);
writeFileSync('index.html', html, 'utf8');
writeFileSync('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${siteUrl}sitemap.xml\n`, 'utf8');
writeFileSync('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${siteUrl}</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n`, 'utf8');
console.log(`Supabase runtime config generated (${config.SUPABASE_URL ? 'configured' : 'offline fallback'}); SEO URL: ${siteUrl}`);
