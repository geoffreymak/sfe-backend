import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/common/filters/problem-details.filter';
import { requestContext } from '../../src/common/logger/request-context';
import { randomUUID } from 'node:crypto';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { Db } from 'mongodb';

export async function createTestingApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  // Attach AsyncLocalStorage request context and X-Request-Id header (mirrors src/main.ts)
  app.use(
    (
      req: IncomingMessage,
      res: ServerResponse,
      next: (err?: unknown) => void,
    ) => {
      const h = req.headers || {};
      const ridHeader = h['x-request-id'] ?? h['x-requestid'];
      const ridCandidate = Array.isArray(ridHeader) ? ridHeader[0] : ridHeader;
      const rid =
        ridCandidate && ridCandidate.length > 0 ? ridCandidate : randomUUID();
      res.setHeader('X-Request-Id', rid);
      const tidHeaderRaw = h['x-tenant-id'];
      const tidCandidate = Array.isArray(tidHeaderRaw)
        ? tidHeaderRaw[0]
        : tidHeaderRaw;
      const tid =
        typeof tidCandidate === 'string' && tidCandidate.length > 0
          ? tidCandidate
          : undefined;
      const store = tid
        ? { requestId: rid, tenantId: tid }
        : { requestId: rid };
      requestContext.run(store, () => next());
    },
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  await app.init();

  // Ensure Mongoose connection is fully ready before running tests
  try {
    const conn = app.get<Connection>(getConnectionToken());
    const CONNECTED = 1; // Mongoose readyState: 1 = connected
    if (Number(conn.readyState) !== CONNECTED) {
      await new Promise<void>((resolve) => {
        const onConnected = () => resolve();
        const onError = () => resolve(); // don't block tests on error; let them surface naturally
        conn.once('connected', onConnected);
        conn.once('error', onError);
        // In case it connected in between
        if (Number(conn.readyState) === CONNECTED) resolve();
      });
    }
    // Extra readiness: ensure transactions are supported (replica set primary ready)
    try {
      const deadline = Date.now() + 15000; // up to 15s
      // Attempt to start & commit an empty transaction; retry until success or deadline
      // This warms up driver+topology so the first test request won't be the first to start a session
      for (;;) {
        try {
          const session = await conn.startSession();
          try {
            await session.withTransaction(async () => {
              // perform a simple collection read within a transaction
              const nativeDb = (conn as unknown as { db?: Db }).db;
              await nativeDb?.collection('__ready__').findOne({}, { session });
            });
          } finally {
            await session.endSession();
          }
          break; // ready
        } catch {
          if (Date.now() > deadline) break; // give up; let tests surface error if any
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    } catch {
      // ignore readiness loop errors
    }
  } catch {
    // ignore if connection token not available
  }
  return app;
}

export function http(app: INestApplication) {
  return request(app.getHttpServer() as unknown as Server);
}
