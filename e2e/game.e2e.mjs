import { launchBrowser } from './_browser.mjs';
import { spawn } from 'node:child_process';

const baseURL = 'http://127.0.0.1:4173';
const server = spawn('python3', ['-m', 'http.server', '4173', '--bind', '127.0.0.1'], { cwd: process.cwd(), stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
await sleep(700);

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
page.setDefaultTimeout(5000);
page.on('pageerror', (error) => console.error('pageerror:', error.message));

await page.route('**/env.js', (route) => route.fulfill({
  contentType: 'application/javascript',
  body: "window.SKY_ENV={SUPABASE_URL:'https://mock.supabase.co',SUPABASE_ANON_KEY:'mock-anon',SUPABASE_REDIRECT_URL:'http://127.0.0.1:4173/'};"
}));
await page.route('**/esm.sh/@supabase/supabase-js@2*', (route) => route.fulfill({
  contentType: 'application/javascript',
  body: `
    let session = null; const listeners = [];
    const user = () => session ? { id: 'e2e-user', email: 'e2e@example.com' } : null;
    const notify = (event) => listeners.forEach((cb) => cb(event, session));
    const auth = {
      onAuthStateChange(cb) { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
      getSession() { return Promise.resolve({ data: { session } }); },
      signInWithPassword() { session = { access_token: 'e2e-token', user: { id: 'e2e-user', email: 'e2e@example.com' } }; notify('SIGNED_IN'); return Promise.resolve({ data: { session }, error: null }); },
      signUp() { session = { access_token: 'e2e-token', user: { id: 'e2e-user', email: 'e2e@example.com' } }; notify('SIGNED_IN'); return Promise.resolve({ data: { session }, error: null }); },
      signInWithOAuth() { return Promise.resolve({ data: {}, error: null }); },
      signOut() { session = null; notify('SIGNED_OUT'); return Promise.resolve({ error: null }); }
    };
    function createClient() {
      return { auth, from() {
        const result = Promise.resolve({ data: [
          { player_name: 'Sakura', score: 99, created_at: '2026-01-01T00:00:00Z' },
          { player_name: 'E2E Player', score: 42, created_at: '2026-01-02T00:00:00Z' }
        ], error: null });
        return { select() { return { order() { return { order() { return { limit() { return result; } }; } }; } }; } };
      }};
    }
    export { createClient };
  `
}));
await page.route('**/api/locale', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ country: 'VN', locale: 'vi' }) }));
// DB.refreshTop() reads the leaderboard over HTTP, not through the Supabase client.
await page.route('**/api/leaderboard', (route) => route.fulfill({
  contentType: 'application/json',
  body: JSON.stringify({ rows: [{ name: 'Sakura', score: 99 }] })
}));
await page.route('**/api/run-ticket', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ticket: 'e2e-ticket' }) }));
await page.route('**/api/submit-score', async (route) => {
  const payload = JSON.parse(route.request().postData() || '{}');
  assert(payload.name === 'e2e', 'Leaderboard payload name was not derived from the account');
  assert(payload.score === 42, 'Leaderboard payload score was not validated');
  assert(payload.ticket === 'e2e-ticket', 'Leaderboard payload must include the server run ticket');
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ rows: [{ name: 'e2e', score: 42 }] }) });
});
await page.addInitScript(() => { window.__SKY_E2E__ = true; window.SKY_REWARDED_AD = { show: () => Promise.resolve(true) }; });

try {
  console.log('E2E: loading page');
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForSelector('#startBtn');
  console.log('E2E: settings/i18n');
  await page.locator('#settingsBtn').click();
  const localeOptions = await page.locator('#languageSelect option').count();
  assert(localeOptions >= 100, `Expected at least 100 locale options, got ${localeOptions}`);
  assert(await page.locator('#languageSelect option[value="zh"]').count() === 1, 'Chinese locale option missing');
  assert(await page.locator('#languageSelect option[value="hi"]').count() === 1, 'Hindi locale option missing');
  const assertRenderedLocale = async (code) => {
    await page.locator('#languageSelect').selectOption(code);
    const missing = await page.evaluate(() => [...document.querySelectorAll('[data-i18n],[data-i18n-placeholder]')].filter((el) => {
      const key = el.getAttribute('data-i18n');
      const placeholderKey = el.getAttribute('data-i18n-placeholder');
      return key ? !el.textContent?.trim() : !el.getAttribute('placeholder')?.trim() || !placeholderKey;
    }).map((el) => el.getAttribute('data-i18n') || el.getAttribute('data-i18n-placeholder')));
    assert(missing.length === 0, `${code} has missing rendered translations: ${missing.join(', ')}`);
  };
  await assertRenderedLocale('zh');
  assert(await page.locator('[data-i18n="subtitle"]').textContent() === '樱花天空中的飞行', 'Chinese translation failed');
  await assertRenderedLocale('hi');
  assert(await page.locator('[data-i18n="subtitle"]').textContent() === 'आकाश में एक उड़ान', 'Hindi translation failed');
  await page.locator('#languageSelect').selectOption('fr');
  assert(await page.locator('[data-i18n="title"]').textContent() === 'SKY BIRD', 'Locale fallback translation failed');
  await page.locator('#languageSelect').selectOption('ja');
  assert(await page.locator('#mapGrid .selCard').count() >= 6, 'New map is missing from the map selector');
  const newMapCard = page.locator('#mapGrid .selCard').last();
  assert((await newMapCard.textContent()).includes('極光'), 'Aurora map card label is missing');
  await newMapCard.evaluate((el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  await page.waitForFunction(() => localStorage.getItem('chimse.map') === 'aurora');
  assert(await page.evaluate(() => localStorage.getItem('chimse.map')) === 'aurora', 'New map selection was not persisted');
  await page.locator('#settingsClose').click();
  assert(await page.locator('#startBtn').textContent() === '飛び立つ', 'Japanese Settings translation failed');

  console.log('E2E: email auth');
  // The account screen replaced the old #authOpen button; login now runs
  // #accountBtn -> #accountLogin -> #authModal.
  await page.locator('#accountBtn').click();
  await page.locator('#accountLogin').click();
  await page.locator('#authEmail').fill('e2e@example.com');
  await page.locator('#authPassword').fill('correct-password');
  await page.locator('#emailLogin').click();
  await page.waitForFunction(() => document.querySelector('#accountStatus')?.textContent.includes('e2e@example.com'));
  assert((await page.locator('#accountStatus').textContent()).includes('e2e@example.com'), 'Email auth flow failed');
  // A successful login closes the auth modal and returns to the account screen.
  await page.waitForSelector('#authModal.hidden', { state: 'attached' });
  await page.locator('#accountClose').click();
  // The score submit button is enabled from DB.online, so wait for the
  // connection indicator to report online before exercising the online flow.
  await page.waitForSelector('#netDot[data-state="online"]');

  console.log('E2E: gameplay');
  await page.locator('#startBtn').click();
  await page.keyboard.press('Space');
  await page.waitForSelector('#pauseBtn.show');
  assert(await page.locator('#pauseBtn').evaluate((el) => el.classList.contains('show')), 'Gameplay did not start');

  await page.evaluate(() => { window.SKY_TEST_HOOKS.startDying(); });
  await page.waitForSelector('#reviveOverlay.show');
  assert(await page.locator('#reviveAdBtn').isEnabled(), 'Rewarded ad button is not enabled');
  console.log('E2E: rewarded revive rejection then grant');
  await page.evaluate(() => { window.SKY_REWARDED_AD.show = () => Promise.resolve(false); });
  await page.locator('#reviveAdBtn').click();
  await page.waitForFunction(() => {
    const text = document.querySelector('#reviveStatus')?.textContent || '';
    return !text.includes('広告を読み込み中') && !text.includes('loading ad') && !text.includes('đang tải quảng cáo');
  });
  assert(await page.locator('#reviveOverlay').evaluate((el) => el.classList.contains('show')), 'Incomplete rewarded ad must not revive');
  await page.evaluate(() => { window.SKY_REWARDED_AD.show = () => Promise.resolve(true); });
  await page.locator('#reviveAdBtn').click();
  await page.waitForSelector('#reviveOverlay:not(.show)');
  assert(await page.locator('#reviveOverlay').evaluate((el) => !el.classList.contains('show')), 'Granted rewarded ad did not revive');

  await page.evaluate(() => { window.SKY_TEST_HOOKS.startGame(); });
  await page.keyboard.press('Space');
  await page.waitForSelector('#pauseBtn.show');
  await page.evaluate(() => { window.SKY_TEST_HOOKS.setScore(42); window.SKY_TEST_HOOKS.startDying(); });
  await page.waitForSelector('#reviveOverlay.show');
  await page.locator('#reviveSkip').click();
  await page.waitForSelector('#overScreen:not(.hidden)');
  // The player name is derived server-side from the account and the input is
  // readonly, so the test asserts the derived value instead of typing one.
  assert(await page.locator('#nameInput').getAttribute('readonly') !== null, 'Player name input must be readonly');
  assert(await page.evaluate(() => window.SKY_TEST_HOOKS.autoPlayerName()) === 'e2e', 'Player name was not derived from the account');
  // A qualifying score is submitted automatically once the leaderboard loads,
  // so the name row hides itself without the player pressing "ghi danh".
  await page.waitForFunction(() => document.querySelector('#miniLb')?.textContent.includes('e2e'));
  assert((await page.locator('#miniLb').textContent()).includes('e2e'), 'Leaderboard submission flow failed');

  console.log('E2E: leaderboard');
  await page.locator('#homeBtn').click();
  await page.locator('#lbBtn').click();
  await page.waitForFunction(() => document.querySelector('#fullLb')?.textContent.includes('Sakura'));
  assert((await page.locator('#fullLb').textContent()).includes('Sakura'), 'Online leaderboard loading failed');
  console.log('E2E: auth, gameplay, rewarded revive, submit and leaderboard sync: OK');
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
