// Resets the local test database and applies the current schema. The URL is
// validated by resolveTestDatabase (local host only, no query string), and
// only its parts / canonical form reach pg and the Prisma CLI: this drops the
// whole `public` schema.
const { execSync } = require('node:child_process');
const { Client } = require('pg');
const { resolveTestDatabase } = require('./helpers/testDatabaseUrl');

module.exports = async () => {
  const { host, port, user, password, database, url } = resolveTestDatabase();

  const client = new Client({ host, port, user, password, database, ssl: false });
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
