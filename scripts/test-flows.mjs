import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function cleanScore(input) {
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 10) : '';
  const score = input.score;
  if (!name || /[<>]/.test(name) || !Number.isSafeInteger(score) || score < 0 || score > 100000) return null;
  return { name, score };
}

class OfflineQueue {
  constructor() { this.items = []; }
  add(item) { this.items = this.items.filter((x) => x.ticket !== item.ticket); this.items.push(item); this.items = this.items.slice(-10); }
  async flush(send) {
    for (const item of [...this.items]) {
      try { await send(item); this.items = this.items.filter((x) => x.ticket !== item.ticket); }
      catch (error) { if (!error.retryable) this.items = this.items.filter((x) => x.ticket !== item.ticket); }
    }
  }
}

function encryptJson(value, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, 150000, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { salt, iv, ciphertext, tag: cipher.getAuthTag() };
}

function decryptJson(envelope, password) {
  const key = crypto.pbkdf2Sync(password, envelope.salt, 150000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, envelope.iv);
  decipher.setAuthTag(envelope.tag);
  return JSON.parse(Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]).toString('utf8'));
}

assert.deepEqual(cleanScore({ name: '  player<>  ', score: 10 }), null);
assert.deepEqual(cleanScore({ name: '  player  ', score: 10 }), { name: 'player', score: 10 });
assert.equal(cleanScore({ name: 'player', score: 100001 }), null);

const queue = new OfflineQueue();
queue.add({ ticket: 'ticket-1', name: 'A', score: 12 });
let attempts = 0;
await queue.flush(async () => { attempts += 1; const error = new Error('network'); error.retryable = true; throw error; });
assert.equal(queue.items.length, 1, 'network failure must retain queued item');
await queue.flush(async () => undefined);
assert.equal(queue.items.length, 0, 'successful retry must remove queued item');
queue.add({ ticket: 'ticket-2', name: 'B', score: 8 });
const conflict = new Error('run already used'); conflict.retryable = false;
await queue.flush(async () => { throw conflict; });
assert.equal(queue.items.length, 0, 'non-retryable conflict must be removed');
assert.equal(attempts, 1);

const original = { app: 'chim-se', schemaVersion: 1, data: { best: 42, history: [{ score: 12 }] } };
const encrypted = encryptJson(original, 'correct horse battery staple');
assert.deepEqual(decryptJson(encrypted, 'correct horse battery staple'), original);
assert.throws(() => decryptJson(encrypted, 'wrong password'));
const tampered = { ...encrypted, ciphertext: Buffer.from(encrypted.ciphertext) };
tampered.ciphertext[0] ^= 1;
assert.throws(() => decryptJson(tampered, 'correct horse battery staple'));

console.log('data sanitization: OK');
console.log(`offline-to-online queue: OK (${attempts} transient retry)`);
console.log('backup AES-GCM roundtrip/tamper detection: OK');
