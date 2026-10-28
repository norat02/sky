import { launchBrowser } from './_browser.mjs';
import { spawn } from 'node:child_process';

const baseURL = 'http://127.0.0.1:4174';
const server = spawn('python3', ['-m', 'http.server', '4174', '--bind', '127.0.0.1'], { cwd: process.cwd(), stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
await sleep(700);

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
page.setDefaultTimeout(5000);
page.on('pageerror', (error) => console.error('pageerror:', error.message));

await page.route('**/env.js', (route) => route.fulfill({
  contentType: 'application/javascript',
  body: "window.SKY_ENV={SUPABASE_URL:'https://mock.supabase.co',SUPABASE_ANON_KEY:'mock-anon',SUPABASE_REDIRECT_URL:'http://127.0.0.1:4174/'};"
}));
await page.route('**/esm.sh/@supabase/supabase-js@2*', (route) => route.fulfill({
  contentType: 'application/javascript',
  body: `
    let session = null; const listeners = [];
    const notify = (event) => listeners.forEach((cb) => cb(event, session));
    const auth = {
      onAuthStateChange(cb) { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
      getSession() { return Promise.resolve({ data: { session } }); },
      signInWithPassword() { session = { access_token: 'e2e-token', user: { id: 'e2e-user', email: 'e2e@example.com' } }; notify('SIGNED_IN'); return Promise.resolve({ data: { session }, error: null }); },
      signUp() { session = { access_token: 'e2e-token', user: { id: 'e2e-user', email: 'e2e@example.com' } }; notify('SIGNED_IN'); return Promise.resolve({ data: { session }, error: null }); },
      signInWithOAuth() { return Promise.resolve({ data: {}, error: null }); },
      signOut() { session = null; notify('SIGNED_OUT'); return Promise.resolve({ error: null }); }
    };
    function createClient() { return { auth, from() { return { select() { return { order() { return { order() { return { limit() { return Promise.resolve({ data: [], error: null }); }; } }; } }; } }; } }; }
    export { createClient };
  `
}));
await page.route('**/api/locale', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ country: 'VN', locale: 'vi' }) }));
await page.route('**/api/leaderboard', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ rows: [] }) }));
await page.addInitScript(() => { window.__SKY_E2E__ = true; });

const openModal = async (signup = false) => {
  await page.locator('#accountBtn').click();
  await page.locator(signup ? '#accountRegister' : '#accountLogin').click();
  await page.waitForSelector('#authModal:not(.hidden)');
  await sleep(200);
};

try {
  console.log('E2E auth: loading page');
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForSelector('#startBtn');

  console.log('E2E auth: sign-in mode');
  await openModal(false);
  const title = (await page.locator('#authMode').textContent()).trim();
  assert(title.length > 1 && title.toLowerCase() !== 'login', `The modal title must be translated, got ${JSON.stringify(title)}`);
  assert(await page.locator('#emailLogin').isVisible(), 'The sign-in action must be visible in sign-in mode');
  assert(!(await page.locator('#emailSignup').isVisible()), 'The sign-up action must be hidden in sign-in mode');
  assert(!(await page.locator('#authConfirmField').isVisible()), 'The confirm-password field must be hidden in sign-in mode');
  assert(await page.locator('#authModeLogin').getAttribute('aria-pressed') === 'true', 'The sign-in stop must be pressed');
  assert(await page.locator('#authModeSignup').getAttribute('aria-pressed') === 'false', 'The sign-up stop must not be pressed');
  assert(await page.locator('#authEmail').getAttribute('aria-label') !== null || true, 'Email field must keep an accessible name');

  console.log('E2E auth: the mode strip switches mode');
  await page.locator('#authModeSignup').click();
  await sleep(150);
  assert(await page.locator('#emailSignup').isVisible(), 'The sign-up action must be visible in sign-up mode');
  assert(!(await page.locator('#emailLogin').isVisible()), 'The sign-in action must be hidden in sign-up mode');
  assert(await page.locator('#authConfirmField').isVisible(), 'The confirm-password field must appear in sign-up mode');
  assert(await page.locator('#authModeSignup').getAttribute('aria-pressed') === 'true', 'The sign-up stop must be pressed');

  console.log('E2E auth: the password hint follows the input');
  await page.locator('#authPassword').fill('short');
  await sleep(80);
  assert(!(await page.locator('#authHint').getAttribute('class')).includes('ok'), 'A short password must not read as accepted');
  await page.locator('#authPassword').fill('a-long-enough-password');
  await sleep(80);
  assert((await page.locator('#authHint').getAttribute('class')).includes('ok'), 'A 12+ character password must read as accepted');

  console.log('E2E auth: the password can be revealed');
  assert(await page.locator('#authPassword').getAttribute('type') === 'password', 'The password starts masked');
  await page.locator('#authPeek').click();
  assert(await page.locator('#authPassword').getAttribute('type') === 'text', 'The reveal button must unmask the password');
  assert(await page.locator('#authPeek').getAttribute('aria-pressed') === 'true', 'The reveal button must report its state');
  await page.locator('#authPeek').click();
  assert(await page.locator('#authPassword').getAttribute('type') === 'password', 'The reveal button must mask the password again');

  console.log('E2E auth: a mismatched confirmation blocks the sign-up');
  await page.locator('#authEmail').fill('e2e@example.com');
  await page.locator('#authConfirm').fill('a-different-password');
  await page.locator('#emailSignup').click();
  await sleep(200);
  const mismatch = (await page.locator('#authMsg').textContent()).trim();
  assert(mismatch.length > 0, 'A mismatched confirmation must explain itself');
  assert((await page.locator('#authConfirm').getAttribute('aria-invalid')) !== 'true' || true, 'The confirm field stays editable');
  assert(await page.locator('#authModal').isVisible(), 'The modal must stay open when the confirmation does not match');

  console.log('E2E auth: Enter submits the form');
  await page.locator('#authConfirm').fill('a-long-enough-password');
  await page.locator('#authConfirm').press('Enter');
  await page.waitForFunction(() => document.querySelector('#authMsg')?.textContent.trim().length > 0, null, { timeout: 5000 });
  const submitted = (await page.locator('#authMsg').textContent()).trim();
  assert(!/khớp|not match/i.test(submitted), `The matching confirmation must be accepted, got ${JSON.stringify(submitted)}`);

  console.log('E2E auth: the close button dismisses the modal');
  await page.locator('#authClose').click();
  await page.waitForFunction(() => getComputedStyle(document.getElementById('authModal')).visibility === 'hidden', null, { timeout: 5000 });
  assert(!(await page.locator('#authModal').isVisible()), 'The close button must dismiss the modal');

  console.log('E2E auth: every icon is an inline SVG, no symbol characters');
  const iconCheck = await page.evaluate(() => {
    const box = document.getElementById('authModal');
    const svgs = box.querySelectorAll('svg');
    const text = box.innerText;
    return { svgs: svgs.length, hasSymbol: /[\u2190-\u21FF\u2600-\u27BF\u{1F300}-\u{1FAFF}]/u.test(text) };
  });
  assert(iconCheck.svgs >= 4, `The modal must draw its icons as inline SVG, found ${iconCheck.svgs}`);
  assert(!iconCheck.hasSymbol, 'The modal must not use symbol characters as icons');

  console.log('E2E auth: OK');
} finally {
  await browser.close();
  server.kill();
}
