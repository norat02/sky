import dotenv from 'dotenv';
dotenv.config();
import { app } from './app.mjs';
import { flushOutbox, closeQueue } from './queue.mjs';
import { closeDb } from './db.mjs';

const port = Number(process.env.PORT || 4000);
const server = app.listen(port, '0.0.0.0', () => console.log(`Sky Bird API listening on ${port}`));
const interval = setInterval(() => flushOutbox().catch((error) => console.error('outbox flush failed', error.message)), 2_000);

async function shutdown(signal) {
  console.log(`${signal}: shutting down`);
  clearInterval(interval);
  server.close(async () => { await closeQueue(); await closeDb(); process.exit(0); });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
