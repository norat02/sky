import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const baseURL = 'http://127.0.0.1:4173';
const server = spawn('python3', ['-m', 'http.server', '4173', '--bind', '127.0.0.1'], { cwd: process.cwd(), stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
await sleep(700);

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
page.setDefaultTimeout(6000);
const exfil = [];
page.on('request', (request) => { if (request.url().includes('/xss-exfil')) exfil.push(request.url()); });
await page.route('**/config.js', (route) => route.fulfill({ contentType: 'application/javascript', body: "window.SKY_CONFIG={};" }));
await page.addInitScript(() => {
  window.__SKY_E2E__ = true;
  window.__XSS_FIRED__ = false;
  window.__XSS_LEAK__ = null;
});

try {
  await page.goto(`${baseURL}/?xss-test=1`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForSelector('#startBtn');
  const roster = await page.evaluate(() => window.SKY_TEST_HOOKS?.getCharacterCatalog?.());
  assert(Array.isArray(roster) && roster.length >= 8, `Expected at least 8 characters, got ${roster?.length}`);
  assert(roster.every((c) => c.advantage && c.disadvantage && Number.isFinite(c.cost)), 'Every character needs advantage, disadvantage and coin cost');
  assert(roster.filter((c) => c.cost === 0).length >= 1, 'At least one character must remain free');
  assert(await page.locator('#charGrid .selCard').count() >= 8, 'Expanded character roster is missing');
  assert((await page.locator('#charGrid .meta').count()) >= 8, 'Character advantage/disadvantage metadata is missing');
  assert(await page.locator('#mapGrid .selCard').count() >= 6, 'Existing maps must remain available');
  await page.evaluate(() => { localStorage.setItem('chimse.coins', '250'); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#startBtn');
  const unlockResult = await page.evaluate(() => window.SKY_TEST_HOOKS.unlockChar('swift'));
  assert(unlockResult === true, 'Coin purchase did not unlock character');
  const wallet = await page.evaluate(() => window.SKY_TEST_HOOKS.getWallet());
  assert(wallet.unlocked.includes('swift') && wallet.coins === 170, 'Unlock wallet accounting is incorrect');

  await page.evaluate(() => {
    const secret = JSON.stringify({ app: 'chim-se-encrypted-backup', ciphertext: 'PRIVATE-BACKUP-CIPHERTEXT' });
    localStorage.setItem('chimse.name', '<img src="/xss-exfil?leak=' + encodeURIComponent(secret) + '" onerror="window.__XSS_LEAK__=localStorage.getItem(\'chimse.backup\')">');
    localStorage.setItem('chimse.map', '<svg onload="window.__XSS_FIRED__=true">');
    localStorage.setItem('chimse.backup', secret);
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#startBtn');
  await page.waitForTimeout(500);
  const xssState = await page.evaluate(() => ({ fired: window.__XSS_FIRED__, leak: window.__XSS_LEAK__, body: document.body.innerHTML }));
  assert(!xssState.fired, 'XSS payload from localStorage executed');
  assert(!xssState.leak, 'XSS payload read backup data');
  assert(exfil.length === 0, `XSS payload exfiltrated data: ${exfil.join(', ')}`);
  assert(!xssState.body.includes('PRIVATE-BACKUP-CIPHERTEXT'), 'Backup ciphertext leaked into rendered DOM');
  console.log('characters roster + localStorage XSS backup leak simulation: OK');
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
