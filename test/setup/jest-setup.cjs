// Jest E2E setup in CommonJS to avoid ESM/CJS mismatches

// Enable TypeScript decorator metadata for NestJS during tests
require('reflect-metadata');

jest.setTimeout(60000);

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

let __server = undefined;

async function readinessCheck(uri) {
  const { MongoClient } = await import('mongodb');
  const deadline = Date.now() + 15000;
  for (;;) {
    let client;
    try {
      client = new MongoClient(uri);
      await client.connect();
      await client.db('admin').command({ ping: 1 });
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          await client.db('test').collection('__ready__').findOne({}, { session });
        });
      } finally {
        await session.endSession();
      }
      await client.close();
      break;
    } catch (e) {
      try { await client?.close(); } catch {}
      if (Date.now() > deadline) throw e;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

beforeAll(async () => {
  const mm = await import('mongodb-memory-server');
  __server = await mm.MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const uri = __server.getUri();
  process.env.MONGO_URI = uri;
  await readinessCheck(uri);
});

afterAll(async () => {
  try {
    const m = await import('mongoose');
    await m.default.disconnect();
  } catch {}
  // Silence noisy ECONNRESET warning emitted during mongodb-memory-server stop()
  let __restoreWarn;
  try {
    const __origWarn = console.warn;
    console.warn = (...args) => {
      const first = args[0];
      if (
        (typeof first === 'string' && first.includes('MongoNetworkError: read ECONNRESET')) ||
        (first && first.name === 'MongoNetworkError' && /ECONNRESET/.test(String(first.message || first)))
      ) {
        return; // ignore known teardown warning
      }
      return __origWarn.apply(console, args);
    };
    __restoreWarn = () => {
      console.warn = __origWarn;
    };
  } catch {}
  try {
    if (__server) await __server.stop();
  } catch {} finally {
    try { __restoreWarn && __restoreWarn(); } catch {}
  }
  __server = undefined;
});
