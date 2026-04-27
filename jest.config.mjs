// Jest configuration using next/jest to support ESM/JSX and Next.js features
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

/** @type {import('jest').Config} */
const customJestConfig = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  moduleFileExtensions: ['js', 'jsx', 'json'],
  moduleNameMapper: {
    '\\.(css|less|sass|scss)$': 'identity-obj-proxy',
    '\\.(gif|ttf|eot|svg|png|jpg|jpeg|webp)$': '<rootDir>/test/__mocks__/fileMock.js',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/tests/**/*.[jt]s?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
  testTimeout: 15000,
};

export default createJestConfig(customJestConfig);
