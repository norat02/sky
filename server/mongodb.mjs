import { MongoClient } from 'mongodb';
export { sanitizeMongoDocument, sanitizeMongoFilter } from './mongodb-sanitize.mjs';

const MONGO_COLLECTIONS = Object.freeze({
  GAME_LOGS: 'game_logs',
  ANALYTICS_EVENTS: 'analytics_events',
  TELEMETRY: 'telemetry',
  ERROR_LOGS: 'error_logs',
  PLAYER_ACTIVITY: 'player_activity',
  AI_DATA: 'ai_data',
});
const ALLOWED_COLLECTIONS = new Set(Object.values(MONGO_COLLECTIONS));
let clientPromise;

function mongoUri() {
  const uri = String(process.env.MONGODB_URI || '').trim();
  if (!uri) {
    const error = new Error('MONGODB_URI is required');
    error.code = 'MONGODB_CONFIG_MISSING';
    throw error;
  }
  return uri;
}

export function isAllowedMongoCollection(collectionName) {
  return typeof collectionName === 'string' && ALLOWED_COLLECTIONS.has(collectionName);
}

export function assertAllowedMongoCollection(collectionName) {
  if (!isAllowedMongoCollection(collectionName)) {
    const error = new Error('mongo collection is not allowed');
    error.code = 'MONGODB_COLLECTION_NOT_ALLOWED';
    error.status = 400;
    throw error;
  }
  return collectionName;
}

export function allowedMongoCollections() {
  return [...ALLOWED_COLLECTIONS];
}

export function getMongoClient() {
  if (!clientPromise) {
    const client = new MongoClient(mongoUri(), {
      appName: 'sky-bird-api',
      tls: true,
      tlsAllowInvalidCertificates: false,
      tlsAllowInvalidHostnames: false,
      serverSelectionTimeoutMS: 5_000,
      waitQueueTimeoutMS: 5_000,
      maxPoolSize: 10,
      maxConnecting: 2,
      retryWrites: true,
      retryReads: true,
      serverApi: { version: '1', strict: true, deprecationErrors: true },
    });
    clientPromise = client.connect().catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  }
  return clientPromise;
}

export async function getMongoCollection(collectionName) {
  const name = assertAllowedMongoCollection(collectionName);
  const client = await getMongoClient();
  const databaseName = String(process.env.MONGODB_DATABASE || '').trim();
  if (!databaseName) {
    const error = new Error('MONGODB_DATABASE is required');
    error.code = 'MONGODB_DATABASE_MISSING';
    throw error;
  }
  return client.db(databaseName).collection(name);
}

export async function closeMongo() {
  if (clientPromise) {
    const client = await clientPromise;
    await client.close();
    clientPromise = undefined;
  }
}

export { MONGO_COLLECTIONS };
