import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';
import { requestContext } from './common/logger/request-context';
import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // CORS allowlist from env (CORS_ORIGINS=comma,separated,urls). Fallback: allow all (dev).
  const allowlist = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowlist.length > 0) {
    app.enableCors({ origin: allowlist });
  } else {
    app.enableCors();
  }

  // Attach AsyncLocalStorage request context and X-Request-Id header
  app.use(
    (
      req: IncomingMessage,
      res: ServerResponse,
      next: (err?: unknown) => void,
    ) => {
      const headers = req.headers || {};
      const headerRid =
        (headers['x-request-id'] as string | undefined) ||
        (headers['x-requestid'] as string | undefined);
      const rid = headerRid && headerRid.length > 0 ? headerRid : randomUUID();
      res.setHeader('X-Request-Id', rid);
      requestContext.run({ requestId: rid }, () => next());
    },
  );

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global RFC7807 Problem Details filter
  app.useGlobalFilters(new ProblemDetailsFilter());

  // Swagger setup at /api
  const config: Omit<OpenAPIObject, 'paths'> = new DocumentBuilder()
    .setTitle('SFE API')
    .setDescription('SFE API documentation')
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-Tenant-Id',
        in: 'header',
        description: 'Tenant context header',
      },
      'X-Tenant-Id',
    )
    .addSecurityRequirements('X-Tenant-Id')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}
void bootstrap();
