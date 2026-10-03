// Runs before each integration test file's imports, so `@/lib/prisma` is
// built against the local test database. next/jest has already loaded `.env`
// (in CI it is written from secrets and may point at production): the
// DATABASE_URL is overridden here and anything non-local is refused.
const DEFAULT_URL = 'postgresql://calico:calico@localhost:5433/calico_test';
const url = process.env.INTEGRATION_DATABASE_URL || DEFAULT_URL;
const { hostname } = new URL(url);
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)) {
  throw new Error(`Integration tests refuse to run against a non-local database (${hostname}).`);
}
process.env.DATABASE_URL = url;
process.env.PG_POOL_MAX = '12';
process.env.PG_POOL_IDLE_MS = '1000';
process.env.WOMPI_PUBLIC_KEY = 'pub_test_integration';
process.env.WOMPI_PRIVATE_KEY = 'prv_test_integration';
process.env.WOMPI_INTEGRITY_SECRET = 'test_integrity_integration';
delete process.env.PRISMA_ACCELERATE_URL;
delete process.env.BREVO_API_KEY; // event emails become no-ops (template IDs are null anyway)
