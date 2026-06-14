/**
 * Centralized secret / env-var validation.
 *
 * Call `validateSecrets()` at server startup (e.g. in instrumentation.js or
 * the first API request). In production every listed variable must be present;
 * missing ones throw immediately so the deploy fails visibly instead of running
 * with a broken configuration.
 *
 * Usage:
 *   import { getSecret } from '@/config/secrets';
 *   const key = getSecret('WOMPI_PRIVATE_KEY');
 */

const REQUIRED_IN_PRODUCTION = [
  'DATABASE_URL',
  'JWT_SECRET',
  'WOMPI_PRIVATE_KEY',
  'WOMPI_EVENTS_SECRET',
  'WOMPI_INTEGRITY_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_S3_BUCKET',
  'AWS_REGION',
  'ADMIN_SECRET',
  'NEXT_PUBLIC_FRONTEND_URL',
];

/**
 * Validate that all required secrets are present.
 * Throws in production; only warns in development.
 */
export function validateSecrets() {
  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]);

  if (missing.length === 0) return;

  const message = `[secrets] Missing required environment variables:\n  ${missing.join('\n  ')}`;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(message);
  } else {
    console.warn(message);
  }
}

/**
 * Read a secret from the environment.
 * Throws if the variable is missing in production; returns undefined in dev.
 *
 * @param {string} key - Name of the environment variable
 * @returns {string}
 */
export function getSecret(key) {
  const value = process.env[key];

  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error(`[secrets] Required environment variable "${key}" is not set.`);
  }

  return value ?? '';
}
