import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/test/.*\\.e2e-spec\\.ts$'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'nodenext',
          target: 'ES2019',
          esModuleInterop: true,
          isolatedModules: false,
          emitDecoratorMetadata: true,
          experimentalDecorators: true,
          useDefineForClassFields: false,
          skipLibCheck: true,
          strictNullChecks: true,
          types: ['jest', 'node'],
        },
        useESM: false,
        diagnostics: false,
      },
    ],
  },
  moduleNameMapper: {
    '^ioredis$': 'ioredis-mock',
    '^serialport$': '<rootDir>/test/mocks/serialport.ts',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/main.ts',
    '!src/**/index.ts',
    '!src/**/module.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    global: { lines: 70, statements: 70, branches: 60, functions: 65 },
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup/jest-setup.cjs'],
};

export default config;
