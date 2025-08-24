jest.setTimeout(60000);

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// Start in-memory MongoDB so AppModule can connect via MONGO_URI
import { MongoTestEnv } from '../utils/mongo-memory';
let mongoose: { disconnect: () => Promise<void> } | undefined;

beforeAll(async () => {
  await MongoTestEnv.start();
  // Dynamically import mongoose to avoid static ESM/CJS interop issues under Jest
  const mod = (await import('mongoose')) as unknown as {
    default: { disconnect: () => Promise<void> };
  };
  mongoose = mod.default;
});

afterAll(async () => {
  // Ensure all driver connections are closed before stopping the in-memory server
  try {
    if (mongoose) {
      await mongoose.disconnect();
    }
  } catch {
    // ignore disconnect errors
  }
  await MongoTestEnv.stop();
});
