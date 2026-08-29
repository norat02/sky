import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const baseURL = (process.env.ADMIN_E2E_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const isLocal = /^(http:\/\/)?127\.0\.0\.1:4173$/.test(baseURL.replace(/^https?:\/\//, ''));
const adminPath = `${baseURL}/${isLocal ? 'admin.html' : 'admin'}`;
const shouldCheckApi = process.env.ADMIN_E2E_SKIP_API !== '1';
const expectAdmin = process.env.ADMIN_E2E_EXPECT_ADMIN === '1';
const email = process.env.ADMIN_E2E_EMAIL || '';
const password = process.env.ADMIN_E2E_PASSWORD || '';
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let server;
if (isLocal) {
  server = spawn('python3', ['-m', 'http.server', '4173', '--bind', '127.0.0.1'], { cwd: process.cwd(), stdio: 'ignore' });
  await sleep(700);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
page.setDefaultTimeout(Number(process.env.ADMIN_E2E_TIMEOUT || 10000));
page.on('pageerror', (error) => console.error('admin pageerror:', error.message));

try {
  console.log(`Admin E2E: loading ${adminPath}`);
  const response = await page.goto(adminPath, { waitUntil: 'domcontentloaded', timeout: 20000 });
  assert(response && response.ok(), `Admin page did not load successfully: ${response?.status()}`);
  await page.waitForSelector('#loginView');
  assert(await page.title() === 'Sky Bird — Khu vực quản trị', 'Admin page title is incorrect');
  assert(await page.locator('meta[name="robots"]').getAttribute('content') === 'noindex,nofollow', 'Admin page must be noindex');
  assert(await page.locator('#loginForm').isVisible(), 'Admin login form is not visible');
  assert(await page.locator('#email').getAttribute('autocomplete') === 'username', 'Email field must be accessible');
  assert(await page.locator('#password').getAttribute('autocomplete') === 'current-password', 'Password field must be accessible');
  assert(await page.locator('#googleButton').isVisible(), 'Google OAuth button is missing');
  assert(await page.locator('a[href="/"]').count() >= 1, 'Back-to-game link is missing');

  if (!isLocal && shouldCheckApi) {
    const unauthenticated = await page.request.get(new URL('/api/admin-data', `${baseURL}/`).href, { failOnStatusCode: false });
    assert(unauthenticated.status() === 401, `Unauthenticated admin API must return 401, got ${unauthenticated.status()}`);
  }

  if (email && password) {
    console.log(`Admin E2E: signing in as ${email}`);
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('#loginButton').click();
    if (expectAdmin) {
      await page.waitForSelector('#appView:not(.hidden)');
      assert(await page.locator('#appView').isVisible(), 'Admin dashboard did not become visible');
      await page.waitForFunction(() => document.querySelector('#statScores')?.textContent.trim() !== '—');
      assert(await page.locator('#syncStatus').textContent() !== 'Tài khoản chưa được cấp quyền', 'Configured admin account was denied');
      assert(await page.locator('#scoresBody tr').count() >= 1, 'Admin scores table did not render');
      await page.locator('#searchInput').fill('unlikely-player-name');
      assert((await page.locator('#scoresBody').textContent()).includes('Không tìm thấy') || (await page.locator('#scoresBody tr').count()) === 1, 'Admin table search did not update');
    } else {
      await page.waitForFunction(() => {
        const message = document.querySelector('#loginMessage')?.textContent || '';
        const denied = document.querySelector('#accessDenied')?.classList.contains('hidden') === false;
        return message.length > 0 || denied;
      });
    }
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert(await page.locator('#loginView').isVisible(), 'Desktop admin login view is not visible');
  console.log(`Admin E2E: UI smoke test passed for ${baseURL}`);
} finally {
  await browser.close();
  if (server) server.kill('SIGTERM');
}
