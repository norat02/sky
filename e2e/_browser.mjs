import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

/**
 * Launch Chromium for the end-to-end suites.
 *
 * Resolution order:
 *   1. CHROMIUM_PATH — explicit override.
 *   2. /usr/bin/chromium — the system browser, when present.
 *   3. Playwright's own downloaded Chromium — used on CI, where the browser
 *      comes from `npx playwright install chromium` and no system binary exists.
 */
export function launchBrowser() {
  const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  return chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
}
