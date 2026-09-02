import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const baseURL = 'http://127.0.0.1:4174';
const server = spawn('python3', ['-m', 'http.server', '4174', '--bind', '127.0.0.1'], {
  cwd: process.cwd(),
  stdio: 'ignore',
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const waitForServer = async () => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseURL}/index.html`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Static server did not become ready at ${baseURL}`);
};
await waitForServer();

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  serviceWorkers: 'block',
});
page.setDefaultTimeout(6000);
const assertResponsiveLayout = async (label) => {
  const layout = await page.evaluate(() => {
    const panel = document.querySelector('#titleScreen .home-panel')?.getBoundingClientRect();
    return {
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      panelRight: panel?.right ?? 0,
    };
  });
  assert(layout.scrollWidth <= layout.viewport + 1, `${label}: unexpected horizontal overflow`);
  assert(layout.panelRight <= layout.viewport + 1, `${label}: home panel exceeds viewport`);
};
await page.route('**/config.js', (route) => route.fulfill({
  contentType: 'application/javascript',
  body: 'window.SKY_CONFIG={};',
}));
await page.addInitScript(() => {
  window.__SKY_E2E__ = true;
});

try {
  await page.goto(`${baseURL}/?purchase-test=1`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForSelector('#startBtn');
  await assertResponsiveLayout('mobile');
  await page.evaluate(() => {
    localStorage.setItem('chimse.coins', '100');
    localStorage.removeItem('chimse.unlocked-characters');
    localStorage.removeItem('chimse.wallet-snapshot');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#charGrid [data-character-id="swift"]');

  const swiftCard = page.locator('#charGrid [data-character-id="swift"]');
  assert((await swiftCard.getAttribute('aria-label'))?.includes('mua'), 'Locked character must expose a purchase label');
  assert((await page.locator('#coinCount').textContent()) === '100', 'Seeded coin balance was not rendered');

  await swiftCard.click();
  await page.waitForFunction(() => document.querySelector('#coinCount')?.textContent === '20');
  const afterPurchase = await page.evaluate(() => ({
    coins: Number(localStorage.getItem('chimse.coins')),
    unlocked: JSON.parse(localStorage.getItem('chimse.unlocked-characters') || '[]'),
    selected: localStorage.getItem('chimse.char'),
    message: document.querySelector('#shopMsg')?.textContent || '',
  }));
  assert(afterPurchase.coins === 20, `Expected 20 coins after purchase, got ${afterPurchase.coins}`);
  assert(afterPurchase.unlocked.includes('swift'), 'Purchased character was not persisted in localStorage');
  assert(afterPurchase.selected === 'swift', 'Purchased character was not selected');
  assert(afterPurchase.message.includes('đang được chọn'), 'Purchase/select feedback is missing');

  await swiftCard.click();
  const afterRepeat = await page.evaluate(() => ({
    coins: Number(localStorage.getItem('chimse.coins')),
    unlocked: JSON.parse(localStorage.getItem('chimse.unlocked-characters') || '[]'),
  }));
  assert(afterRepeat.coins === 20, 'Selecting an owned character charged coins twice');
  assert(afterRepeat.unlocked.filter((id) => id === 'swift').length === 1, 'Unlocked character list contains duplicate IDs');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#charGrid [data-character-id="swift"]');
  const afterReload = await page.evaluate(() => ({
    coins: Number(localStorage.getItem('chimse.coins')),
    unlocked: JSON.parse(localStorage.getItem('chimse.unlocked-characters') || '[]'),
    selected: localStorage.getItem('chimse.char'),
    cardText: document.querySelector('#charGrid [data-character-id="swift"]')?.textContent || '',
    selectedClass: document.querySelector('#charGrid [data-character-id="swift"]')?.classList.contains('on'),
  }));
  assert(afterReload.coins === 20, 'Coin balance did not survive reload');
  assert(afterReload.unlocked.includes('swift'), 'Unlocked character did not survive reload');
  assert(afterReload.selected === 'swift' && afterReload.selectedClass, 'Selected character did not survive reload');
  assert(afterReload.cardText.includes('đang chọn'), 'Reloaded card does not show selected state');

  for (const viewport of [{ width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#startBtn');
    await assertResponsiveLayout(`${viewport.width}x${viewport.height}`);
  }

  console.log('character purchase + localStorage persistence + responsive layout: OK');
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
