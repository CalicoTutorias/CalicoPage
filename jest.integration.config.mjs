// Real-Postgres integration suite (concurrency guarantees). Never in `pnpm test`.
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

export default createJestConfig({
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/__integration__/**/*.int.test.js'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  setupFiles: ['<rootDir>/src/__integration__/setupEnv.js'],
  setupFilesAfterEnv: ['<rootDir>/src/__integration__/silenceExpectedLogs.js'],
  globalSetup: '<rootDir>/src/__integration__/globalSetup.js',
  testTimeout: 60_000,
  maxWorkers: 1,
});
