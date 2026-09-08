import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');
const files = [
  'index.html',
  'styles.css',
  'ui.js',
  'game.js',
  'consent-gate.js',
  'security-integrity.js',
  'native-bridge.js',
  'privacy-policy.html',
  'terms-of-use.html',
  'og-image.png',
  'robots.txt',
  'sitemap.xml',
  'env.js',
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of files) {
  await cp(join(root, file), join(dist, file));
}
console.log(`Built shared web client into ${dist}`);
