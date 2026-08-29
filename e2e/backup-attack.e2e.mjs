import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const baseURL = 'http://127.0.0.1:4173';
const password = 'attack-test-password';
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
  const result = await page.evaluate(async (password) => {
    const hooks = window.SKY_TEST_HOOKS;
    if (!hooks?.encryptBackup || !hooks?.decryptBackup || !hooks?.deriveBackupKey || !hooks?.b64Bytes || !hooks?.restoreBackupData) return { ready: false };
    const payload = { app: 'chim-se', schemaVersion: 2, data: { best: 99, history: [] } };
    const envelope = await hooks.encryptBackup(payload, password);
    const key = await hooks.deriveBackupKey(password, hooks.b64Bytes(envelope.salt), 'decrypt');
    const iv = hooks.b64Bytes(envelope.iv);
    const cipher = hooks.b64Bytes(envelope.ciphertext);
    const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    const modified = JSON.parse(new TextDecoder().decode(clear));
    modified.data.best = 100000;
    modified.watermark.layers[4] = 'x' + 'tampered' + 'z';
    const correctKey = await hooks.deriveBackupKey(password, hooks.b64Bytes(envelope.salt), 'encrypt');
    const modifiedCipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, correctKey, new TextEncoder().encode(JSON.stringify(modified)));
    const attackedEnvelope = { ...envelope, ciphertext: btoa(String.fromCharCode(...new Uint8Array(modifiedCipher))) };
    let rejected = false;
    try { await hooks.decryptBackup(attackedEnvelope, password); } catch { rejected = true; }
    const missingWatermark = { ...modified };
    delete missingWatermark.watermark;
    const missingCipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, correctKey, new TextEncoder().encode(JSON.stringify(missingWatermark)));
    const missingEnvelope = { ...envelope, ciphertext: btoa(String.fromCharCode(...new Uint8Array(missingCipher))) };
    let missingRejected = false;
    try { await hooks.decryptBackup(missingEnvelope, password); } catch { missingRejected = true; }
    const tamperedCipherBytes = new Uint8Array(hooks.b64Bytes(envelope.ciphertext));
    tamperedCipherBytes[0] ^= 1;
    const tamperedEnvelope = { ...envelope, ciphertext: btoa(String.fromCharCode(...tamperedCipherBytes)) };
    let ciphertextRejected = false;
    try { await hooks.decryptBackup(tamperedEnvelope, password); } catch { ciphertextRejected = true; }
    const before = localStorage.getItem('chimse.best');
    let restoreRejected = false;
    try { hooks.restoreBackupData(modified); } catch { restoreRejected = true; }
    const after = localStorage.getItem('chimse.best');
    return { ready: true, rejected, missingRejected, ciphertextRejected, restoreRejected, storageUnchanged: before === after };
  }, password);
  assert(result.ready, 'backup attack E2E hooks are missing');
  assert(result.rejected, 'modified watermark must be rejected after valid re-encryption');
  assert(result.missingRejected, 'backup without watermark must be rejected');
  assert(result.ciphertextRejected, 'tampered ciphertext must be rejected');
  assert(result.restoreRejected, 'restore must reject a modified watermark payload');
  assert(result.storageUnchanged, 'rejected backup must not modify localStorage');
  console.log('backup attack simulation E2E: OK');
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
