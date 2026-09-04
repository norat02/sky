import amqp from 'amqplib';
import { pool } from './db.mjs';

let connection;
let channel;
const exchange = 'sky.events';

export async function getChannel() {
  if (!process.env.RABBITMQ_URL) return null;
  if (channel) return channel;
  connection = await amqp.connect(process.env.RABBITMQ_URL);
  channel = await connection.createChannel();
  await channel.assertExchange(exchange, 'topic', { durable: true });
  return channel;
}

export async function publishEvent(type, payload) {
  const ch = await getChannel();
  if (!ch) return false;
  return ch.publish(exchange, type, Buffer.from(JSON.stringify(payload)), { persistent: true, contentType: 'application/json' });
}

export async function flushOutbox(batchSize = 50) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id, event_type, payload FROM outbox_events WHERE published_at IS NULL ORDER BY id FOR UPDATE SKIP LOCKED LIMIT $1', [batchSize]);
    for (const event of rows) {
      if (await publishEvent(event.event_type, event.payload)) await client.query('UPDATE outbox_events SET published_at = now() WHERE id = $1', [event.id]);
    }
    await client.query('COMMIT');
    return rows.length;
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}

export async function closeQueue() { await channel?.close().catch(() => {}); await connection?.close().catch(() => {}); }
