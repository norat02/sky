import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const baseURL = 'http://127.0.0.1:4173';
const iterations = Math.max(3, Number.parseInt(process.env.BENCHMARK_ITERATIONS || '20', 10));
const password = 'benchmark-password-2026';
const server = spawn('python3', ['-m', 'http.server', '4173', '--bind', '127.0.0.1'], { cwd: process.cwd(), stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
};

await sleep(700);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox']
});
const page = await browser.newPage({ serviceWorkers: 'block' });
page.setDefaultTimeout(15000);
await page.route('**/config.js', (route) => route.fulfill({ contentType: 'application/javascript', body: 'window.SKY_CONFIG={};' }));
await page.addInitScript(() => { window.__SKY_E2E__ = true; });

try {
  await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('#startBtn');
  const result = await page.evaluate(async ({ iterations, password }) => {
    const hooks = window.SKY_TEST_HOOKS;
    if (!hooks?.encryptBackup || !hooks?.decryptBackup) throw new Error('Backup E2E hooks are unavailable');
    const payload = {
      app: 'chim-se',
      schemaVersion: 2,
      exportedAt: '2026-08-29T00:00:00.000Z',
      data: {
        best: 12345,
        name: 'Benchmark',
        mute: false,
        character: 'tit',
        map: 'sakura',
        history: Array.from({ length: 24 }, (_, index) => ({ score: index * 100, at: 1700000000000 + index }))
      }
    };
    const encryptMs = [];
    const decryptMs = [];
    let envelope;
    for (let i = 0; i < iterations + 1; i += 1) {
      const startEncrypt = performance.now();
      envelope = await hooks.encryptBackup(payload, password);
      const endEncrypt = performance.now();
      const startDecrypt = performance.now();
      const restored = await hooks.decryptBackup(envelope, password);
      const endDecrypt = performance.now();
      if (restored?.watermark?.layers?.length !== 5 || restored.data?.best !== payload.data.best) throw new Error('Benchmark roundtrip failed');
      if (i > 0) {
        encryptMs.push(endEncrypt - startEncrypt);
        decryptMs.push(endDecrypt - startDecrypt);
      }
    }
    return { iterations, encryptMs, decryptMs, ciphertextBytes: envelope.ciphertext.length };
  }, { iterations, password });

  const summary = {
    benchmark: 'backup-watermark-5-layer',
    runtime: 'Chromium Web Crypto',
    iterations: result.iterations,
    payload: 'schemaVersion=2, history=24 records',
    ciphertextBytes: result.ciphertextBytes,
    encryptMs: {
      average: result.encryptMs.reduce((sum, value) => sum + value, 0) / result.encryptMs.length,
      median: percentile(result.encryptMs, 0.5),
      p95: percentile(result.encryptMs, 0.95),
      min: Math.min(...result.encryptMs),
      max: Math.max(...result.encryptMs)
    },
    decryptMs: {
      average: result.decryptMs.reduce((sum, value) => sum + value, 0) / result.decryptMs.length,
      median: percentile(result.decryptMs, 0.5),
      p95: percentile(result.decryptMs, 0.95),
      min: Math.min(...result.decryptMs),
      max: Math.max(...result.decryptMs)
    }
  };
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
