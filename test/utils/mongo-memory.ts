// Use dynamic imports for ESM-only modules to keep Jest E2E runner happy
// (avoids static ESM import parsing at transform time)
// Type-only imports below are erased at compile time and safe for ts-jest.
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { MongoClient, ClientSession } from 'mongodb';

export class MongoTestEnv {
  private static server?: MongoMemoryReplSet;

  static async start(): Promise<string> {
    if (this.server) {
      const uri = this.server.getUri();
      process.env.MONGO_URI = process.env.MONGO_URI || uri;
      return uri;
    }
    const mm = (await import(
      'mongodb-memory-server'
    )) as typeof import('mongodb-memory-server');
    const server = await mm.MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    // Ensure replica set is fully initialized before using its URI
    this.server = server;
    const uri = server.getUri();
    process.env.MONGO_URI = uri;

    // Extra readiness check: ensure transactions are supported before proceeding
    const deadline = Date.now() + 15000; // up to 15s
    while (true) {
      let client: MongoClient | undefined;
      try {
        const mongo = (await import('mongodb')) as typeof import('mongodb');
        client = new mongo.MongoClient(uri);
        await client.connect();
        // Basic ping
        await client.db('admin').command({ ping: 1 });
        // Ensure a session & transaction can start and commit (requires RS primary)
        // Use a normal database (not admin/config/local) and a harmless read op
        const session: ClientSession = client.startSession();
        try {
          await session.withTransaction(async () => {
            await client!
              .db('test')
              .collection('__ready__')
              .findOne({}, { session });
          });
        } finally {
          await session.endSession();
        }
        await client.close();
        break; // ready
      } catch (e) {
        try {
          await client?.close();
        } catch {
          // ignore close error
        }
        if (Date.now() > deadline) {
          // Surface the last error if it never stabilizes
          throw e;
        }
        // brief backoff before retry
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    return uri;
  }

  static async stop(): Promise<void> {
    if (this.server) {
      try {
        await this.server.stop();
      } catch {
        // ignore teardown errors from mongodb-memory-server
      }
      this.server = undefined;
    }
  }
}
