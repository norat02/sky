import { launchBrowser } from './_browser.mjs';
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

const browser = await launchBrowser();
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

// The economy is server authoritative: a purchase only settles when the API
// returns the updated profile, so the test signs in and mocks /api/economy.
const SERVER_PROFILE = {
  display_name: 'e2e',
  best_score: 0,
  flights: 0,
  coins: 20,
  unlocked_characters: ['tit', 'swift'],
  selected_character: 'swift',
  selected_map: 'sakura',
  language: 'vi',
  volume: 50,
  muted: false,
};
const economyCalls = [];

await page.route('**/env.js', (route) => route.fulfill({
  contentType: 'application/javascript',
  body: "window.SKY_ENV={SUPABASE_URL:'https://mock.supabase.co',SUPABASE_ANON_KEY:'mock-anon',SUPABASE_REDIRECT_URL:'http://127.0.0.1:4174/'};",
}));
await page.route('**/api/leaderboard', (route) => route.fulfill({
  contentType: 'application/json',
  body: JSON.stringify({ rows: [] }),
}));
await page.route('**/api/economy', async (route) => {
  const payload = JSON.parse(route.request().postData() || '{}');
  economyCalls.push(payload);
  assert(payload.operation === 'unlock_character', `Unexpected economy operation: ${payload.operation}`);
  assert(payload.character === 'swift', `Unexpected character purchase: ${payload.character}`);
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ profile: SERVER_PROFILE }) });
});
await page.route('**/esm.sh/@supabase/supabase-js@2*', (route) => route.fulfill({
  contentType: 'application/javascript',
  body: `
    let session = { access_token: 'e2e-token', user: { id: 'e2e-user', email: 'e2e@example.com' } };
    const listeners = [];
    const auth = {
      onAuthStateChange(cb) { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
      getSession() { return Promise.resolve({ data: { session } }); },
      signInWithPassword() { return Promise.resolve({ data: { session }, error: null }); },
      signUp() { return Promise.resolve({ data: { session }, error: null }); },
      signInWithOAuth() { return Promise.resolve({ data: {}, error: null }); },
      signOut() { session = null; return Promise.resolve({ error: null }); }
    };
    function createClient() {
      return { auth, from() {
        const result = Promise.resolve({ data: null, error: null });
        return { select() { return { eq() { return { maybeSingle() { return result; } }; } }; }, upsert() { return result; } };
      }};
    }
    export { createClient };
  `,
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
  await page.waitForSelector('#netDot[data-state="online"]');

  // Characters live in the shop screen; open it before addressing the card.
  await page.locator('#shopBtn').click();
  await page.waitForSelector('#shopGrid [data-character-id="swift"]');

  const swiftCard = page.locator('#shopGrid [data-character-id="swift"]');
  assert((await swiftCard.getAttribute('aria-label'))?.includes('mua'), 'Locked character must expose a purchase label');
  assert((await page.locator('#coinCount').textContent()) === '100', 'Seeded coin balance was not rendered');

  await swiftCard.click();
  await page.waitForFunction(() => document.querySelector('#coinCount')?.textContent === '20');
  const afterPurchase = await page.evaluate(() => ({
    coins: Number(localStorage.getItem('chimse.coins')),
    unlocked: JSON.parse(localStorage.getItem('chimse.unlocked-characters') || '[]'),
    selected: localStorage.getItem('chimse.char'),
    message: document.querySelector('#shopScreenMsg')?.textContent || '',
  }));
  assert(afterPurchase.coins === 20, `Expected 20 coins after purchase, got ${afterPurchase.coins}`);
  assert(afterPurchase.unlocked.includes('swift'), 'Purchased character was not persisted in localStorage');
  assert(afterPurchase.selected === 'swift', 'Purchased character was not selected');
  assert(afterPurchase.message.includes('đã được mở'), 'Purchase/select feedback is missing');
  assert(economyCalls.length === 1, `Expected exactly one economy transaction, got ${economyCalls.length}`);

  // Clicking an owned character selects it and must not charge again.
  await swiftCard.click();
  await sleep(400);
  const afterRepeat = await page.evaluate(() => ({
    coins: Number(localStorage.getItem('chimse.coins')),
    unlocked: JSON.parse(localStorage.getItem('chimse.unlocked-characters') || '[]'),
  }));
  assert(afterRepeat.coins === 20, 'Selecting an owned character charged coins twice');
  assert(afterRepeat.unlocked.filter((id) => id === 'swift').length === 1, 'Unlocked character list contains duplicate IDs');
  assert(economyCalls.length === 1, 'Selecting an owned character must not send an economy transaction');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#startBtn');
  // A reload returns to the home screen, so the shop has to be reopened.
  await page.locator('#shopBtn').click();
  await page.waitForSelector('#shopGrid [data-character-id="swift"]');
  const afterReload = await page.evaluate(() => ({
    coins: Number(localStorage.getItem('chimse.coins')),
    unlocked: JSON.parse(localStorage.getItem('chimse.unlocked-characters') || '[]'),
    selected: localStorage.getItem('chimse.char'),
    cardText: document.querySelector('#shopGrid [data-character-id="swift"]')?.textContent || '',
    selectedClass: document.querySelector('#shopGrid [data-character-id="swift"]')?.classList.contains('on'),
  }));
  assert(afterReload.coins === 20, 'Coin balance did not survive reload');
  assert(afterReload.unlocked.includes('swift'), 'Unlocked character did not survive reload');
  assert(afterReload.selected === 'swift' && afterReload.selectedClass, 'Selected character did not survive reload');
  assert(afterReload.cardText.includes('đang chọn'), 'Reloaded card does not show selected state');

  // The game is portrait only: landscape replaces the UI with a rotate notice,
  // so the responsive sweep stays inside portrait viewports.
  for (const viewport of [{ width: 768, height: 1024 }, { width: 414, height: 896 }]) {
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
