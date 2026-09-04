import dotenv from 'dotenv';
dotenv.config();
import { flushOutbox, closeQueue } from './queue.mjs';
import { closeDb } from './db.mjs';

console.log('Sky Bird outbox worker started');
const interval = setInterval(() => flushOutbox().catch((error) => console.error('worker error', error.message)), 1_000);
async function shutdown() { clearInterval(interval); await closeQueue(); await closeDb(); process.exit(0); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
