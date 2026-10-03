// Resets the local test database and applies the current schema. Refuses any
// non-local host: this drops the whole `public` schema.
const { execSync } = require('node:child_process');
const { Client } = require('pg');

const DEFAULT_URL = 'postgresql://calico:calico@localhost:5433/calico_test';

module.exports = async () => {
  const url = process.env.INTEGRATION_DATABASE_URL || DEFAULT_URL;
  const { hostname } = new URL(url);
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)) {
    throw new Error(`Integration tests refuse to reset a non-local database (${hostname}).`);
  }

  const client = new Client({ connectionString: url, ssl: false });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  } finally {
    await client.end();
  }

  // The schema is empty, so `db push` has no data-loss prompt to accept.
  const env = { ...process.env, DATABASE_URL: url };
  execSync('pnpm exec prisma db push', { env, stdio: 'inherit' });
  execSync('pnpm exec prisma db execute --file prisma/sql/reviews_session_xor_event.sql', { env, stdio: 'inherit' });
};
