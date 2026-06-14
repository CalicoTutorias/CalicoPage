/**
 * Applies the pending migration using the same pg pool config that works in
 * the app (rejectUnauthorized: false), bypassing the Prisma CLI's rustls
 * which rejects the AWS RDS self-signed certificate chain.
 *
 * Usage:
 *   node --env-file=.env prisma/apply-pending.mjs
 *
 * After running this script, register the migration as applied:
 *   npx prisma migrate resolve --applied 20260613000000_add_token_version_student_reviews
 */

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set. Run with --env-file=.env');
  process.exit(1);
}

const url = new URL(DATABASE_URL);
const pool = new Pool({
  host: url.hostname,
  port: parseInt(url.port) || 5432,
  database: url.pathname.slice(1).split('?')[0],
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  ssl: { rejectUnauthorized: false },
});

const migrationPath = join(
  __dirname,
  'migrations',
  '20260613000000_add_token_version_student_reviews',
  'migration.sql',
);

const sql = readFileSync(migrationPath, 'utf8');

async function main() {
  const client = await pool.connect();
  console.log('Connected to database:', url.hostname);

  try {
    await client.query('BEGIN');
    console.log('Applying migration...');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✓ Migration applied successfully.');
    console.log('');
    console.log('Next step — register as applied in Prisma history:');
    console.log('  npx prisma migrate resolve --applied 20260613000000_add_token_version_student_reviews');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ Migration failed:', err.message);
    console.error('Detail:', err.detail ?? '(none)');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
