// @ts-check
/**
 * Playwright config — visual regression suite for the Student Booking Module.
 *
 * Activation (deliberate opt-in — heavy install, ~250 MB browsers):
 *   npm install --save-dev @playwright/test
 *   npx playwright install --with-deps chromium
 *   npm run e2e:vr        (after adding the script to package.json)
 *
 * The config intentionally lives at repo root so `npx playwright test` finds it.
 * Test files are scoped to `e2e/` to keep them out of Jest's discovery glob.
 */

const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.E2E_PORT || 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list']],

  // Single source of truth for screenshot tolerance.
  // 0.2% pixel diff allowance absorbs anti-aliasing noise across CI runners.
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.002,
      animations: 'disabled',
      caret: 'hide',
    },
  },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // Pinned viewport for stable layout snapshots
    viewport: { width: 1280, height: 800 },
    // Pinned locale + timezone — same as Bogotá production
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
  ],

  // Boots the Next.js dev server before the suite. CI uses `next start` against
  // a prebuilt bundle for determinism — see e2e/visual-regression/README.md.
  webServer: {
    command: process.env.CI
      ? `npx next start --port ${PORT}`
      : `npx next dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
