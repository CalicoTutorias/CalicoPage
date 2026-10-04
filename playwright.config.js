// @ts-check
/**
 * Playwright config — functional E2E suite for events (spec §10.4).
 *
 * Runs locally against the dev server, the LOCAL database from .env and the
 * Wompi sandbox: `pnpm test:e2e` (not part of CI). Preconditions: the local
 * database is migrated and seeded (`pnpm db:seed && pnpm db:seed:test`) and
 * Chromium is installed (`pnpm exec playwright install chromium`).
 *
 * Test files live in `e2e/`, outside Jest's discovery globs.
 */

const { defineConfig, devices } = require('@playwright/test');

const PORT = 3100;
// The browser must use `localhost`: `next dev` answers 403 to dev assets
// requested from any other origin (allowedDevOrigins), so pages served from
// 127.0.0.1 never hydrate. The readiness probe below is a plain GET.
const BASE_URL = `http://localhost:${PORT}`;

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Same locale + timezone as Bogotá production.
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
