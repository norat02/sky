import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const baseURL = 'http://127.0.0.1:4173';
const server = spawn('python3', ['-m', 'http.server', '4173', '--bind', '127.0.0.1'], { cwd: process.cwd(), stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
await sleep(700);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ serviceWorkers: 'block' });
page.setDefaultTimeout(10000);
await page.route('**/config.js', (route) => route.fulfill({ contentType: 'application/javascript', body: 'window.SKY_CONFIG={};' }));
await page.addInitScript(() => { window.__SKY_E2E__ = true; });
try {
  await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('#startBtn');
  const result = await page.evaluate(async () => {
    const hooks = window.SKY_TEST_HOOKS;
    if (!hooks || typeof hooks.createBackupWatermark !== 'function' || typeof hooks.validateBackupWatermark !== 'function') return { ready: false };
    const payload = { app: 'chim-se', schemaVersion: 2, exportedAt: '2026-08-29T00:00:00.000Z', data: { best: 7, history: [] } };
    const envelope = { salt: new Uint8Array(16), iv: new Uint8Array(12) };
    const encrypted = await hooks.encryptBackup(payload, 'correct horse battery staple');
    const decrypted = await hooks.decryptBackup(encrypted, 'correct horse battery staple');
    const decryptedHasFiveLayers = !!(decrypted.watermark && decrypted.watermark.layers.length === 5);
    const envelopeText = JSON.stringify(encrypted);
    const watermarkHidden = !envelopeText.includes('watermark-final-v1') && !envelopeText.includes('sky-bird-watermark');
    const watermark = await hooks.createBackupWatermark(payload, envelope);
    const altered = { ...watermark, layers: [...watermark.layers.slice(0, 4), 'tampered'] };
    return { ready: true, layerCount: watermark.layers.length, valid: await hooks.validateBackupWatermark(watermark, payload, envelope), altered: await hooks.validateBackupWatermark(altered, payload, envelope), roundTrip: decrypted.data.best === 7, decryptedHasFiveLayers, watermarkHidden };
  });
  assert(result.ready, 'backup watermark E2E hooks are missing');
  assert(result.layerCount === 5, 'backup watermark must contain five layers');
  assert(result.valid === true, 'valid backup watermark must pass');
  assert(result.roundTrip === true, 'encrypted backup roundtrip must preserve data');
  assert(result.decryptedHasFiveLayers === true, 'encrypted backup must contain five hidden watermark layers after decrypt');
  assert(result.watermarkHidden === true, 'watermark markers must not be visible in the encrypted envelope');
  assert(result.altered === false, 'altered backup watermark must fail');
  console.log('backup watermark E2E: OK');
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
