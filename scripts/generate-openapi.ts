// scripts/generate-openapi.ts
import 'reflect-metadata';
import { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';

type ModuleCtor = Type<unknown>;

async function resolveAppModule(): Promise<ModuleCtor> {
  // Permet d’être robuste vis-à-vis de la structure du monorepo
  const envHint = process.env.APP_MODULE_PATH; // ex: apps/api/src/app.module
  const candidates = [
    envHint,
    'apps/api/src/app.module',
    'src/app.module',
    'apps/backend/src/app.module',
  ].filter(Boolean) as string[];

  // CJS fallback require (works when started with -r ts-node/register)
  const req = createRequire(path.resolve(process.cwd(), 'package.json'));

  for (const p of candidates) {
    const tryPaths = [p, `${p}.ts`, `${p}.js`];
    for (const tp of tryPaths) {
      const abs = path.resolve(tp);
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const raw = await import(pathToFileURL(abs).href);
        if (raw && typeof raw === 'object' && 'AppModule' in raw) {
          const maybeModule = (raw as { AppModule?: unknown }).AppModule;
          if (typeof maybeModule === 'function')
            return maybeModule as ModuleCtor;
        }
      } catch {
        void 0; // ignore dynamic import failure
      }
      // Fallback: CJS require (ts-node/register hooks into require for TS)
      try {
        const modUnknown: unknown = req(abs);
        if (
          modUnknown &&
          typeof modUnknown === 'object' &&
          'AppModule' in modUnknown
        ) {
          const maybeModule = (modUnknown as { AppModule?: unknown }).AppModule;
          if (typeof maybeModule === 'function')
            return maybeModule as ModuleCtor;
        }
      } catch {
        void 0; // ignore require failure
      }
    }
  }
  throw new Error(
    'AppModule introuvable. Renseigne APP_MODULE_PATH=... ou ajuste la liste dans scripts/generate-openapi.ts',
  );
}

async function bootstrap() {
  const AppModule = await resolveAppModule();
  let mem: MongoMemoryServer | null = null;
  try {
    const needMem = process.env.USE_MEM_MONGO === '1' || !process.env.MONGO_URI;
    if (needMem) {
      mem = await MongoMemoryServer.create();
      const uri = mem.getUri('sfe');
      process.env.MONGO_URI = uri;
    }
    const app: INestApplication = await NestFactory.create(AppModule, {
      logger: false,
    });

    // Si ton projet a déjà un SwaggerModule configuré, ce builder ne fait que compléter titre/version.
    const config = new DocumentBuilder()
      .setTitle('SFE API')
      .setDescription('OpenAPI autogénéré depuis le code')
      .setVersion('v1')
      .addBearerAuth() // si ton OpenAPI déclare un schéma securityName = 'bearer'
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

    const out = path.resolve('openapi.json');
    // IMPORTANT: Swagger récupère tes @ApiTags, @ApiBearerAuth, @ApiBody, @ApiParam, @ApiHeader, etc.
    // Rien n’est “inventé” : tout vient de tes decorators et DTOs.

    fs.writeFileSync(
      out,
      JSON.stringify(
        SwaggerModule.createDocument(app, config, { deepScanRoutes: true }),
        null,
        2,
      ),
      'utf-8',
    );
    await app.close();

    console.log(`[OK] openapi.json généré -> ${out}`);
  } finally {
    if (mem) await mem.stop();
  }
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
