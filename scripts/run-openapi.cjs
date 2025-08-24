'use strict';
// scripts/run-openapi.cjs
// Purpose: run scripts/generate-openapi.ts with ts-node using CJS compiler options to avoid TS5110

// Force in-memory Mongo unless explicitly disabled
if (!process.env.USE_MEM_MONGO) process.env.USE_MEM_MONGO = '1';

// Optionally hint AppModule path
if (!process.env.APP_MODULE_PATH) process.env.APP_MODULE_PATH = 'src/app.module';

// Register ts-node with safe compiler options (CommonJS + classic node resolution)
require('ts-node').register({
  transpileOnly: true,
  skipProject: true,
  compilerOptions: {
    module: 'CommonJS',
    moduleResolution: 'node',
    target: 'ES2020',
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    esModuleInterop: true,
  },
});

// Enable tsconfig-paths for path mapping if present
require('tsconfig-paths/register');

// Execute the TypeScript generator
require('./generate-openapi.ts');
