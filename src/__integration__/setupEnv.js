// Runs before each integration test file's imports, so `@/lib/prisma` is
// built against the local test database. next/jest may have loaded a local
// `.env` (CI has none): the DATABASE_URL is overridden with the validated
// canonical test URL, and the credentials of external services are replaced
// or removed.
const { resolveTestDatabase } = require('./helpers/testDatabaseUrl');

process.env.DATABASE_URL = resolveTestDatabase().url;
process.env.PG_POOL_MAX = '12';
process.env.PG_POOL_IDLE_MS = '1000';
process.env.WOMPI_PUBLIC_KEY = 'pub_test_integration';
process.env.WOMPI_PRIVATE_KEY = 'prv_test_integration';
process.env.WOMPI_INTEGRITY_SECRET = 'test_integrity_integration';
// src/lib/s3.js requires credentials at import time; dummy ones keep any
// accidental S3 call from reaching a real bucket.
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
delete process.env.PRISMA_ACCELERATE_URL;
delete process.env.BREVO_API_KEY; // event emails become no-ops (template IDs are null anyway)
// Google Calendar: never authenticate with real credentials from a test run.
delete process.env.GOOGLE_ADMIN_REFRESH_TOKEN;
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;
delete process.env.CALICO_CALENDAR_ID;
