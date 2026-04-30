// @ts-check
/**
 * Visual regression — Student Booking flow
 *
 * Captures pixel screenshots of the booking-flow surfaces and fails the build
 * if anything drifts beyond `maxDiffPixelRatio` (configured globally).
 *
 * Each route test follows the same recipe:
 *   1. Stub the API responses the page reads (so we never depend on a live DB
 *      or external service for a visual test).
 *   2. Wait for `domcontentloaded` + a sentinel selector.
 *   3. Snapshot the full page or a scoped locator.
 *
 * On first run, screenshots are recorded. Commit them to git. Subsequent runs
 * diff against the committed image and fail if the layout changes.
 *
 * Prerequisite: see `e2e/visual-regression/README.md` for install steps.
 */

const { test, expect } = require('@playwright/test');

// ─── helpers ────────────────────────────────────────────────────────

/** Stub a JSON GET endpoint with a deterministic payload. */
async function stubJson(page, url, body, status = 200) {
  await page.route(url, (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    }),
  );
}

const FAKE_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjQyfQ.signature';

async function loginAsStudent(page) {
  await page.addInitScript((token) => {
    window.localStorage.setItem('calico_auth_token', token);
  }, FAKE_JWT);
  await stubJson(page, '**/api/auth/me', {
    success: true,
    user: { id: 42, name: 'Laura Estudiante', email: 'laura@test.co', isTutorApproved: false },
  });
}

// ─── Tutor Search ───────────────────────────────────────────────────

test.describe('Booking Flow — Tutor Search', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);

    await stubJson(page, '**/api/users/tutors**', {
      success: true,
      count: 2,
      tutors: [
        {
          id: 1,
          name: 'Carlos Tutor',
          profilePictureUrl: null,
          tutorProfile: {
            review: 4.7,
            numReview: 12,
            bio: 'Tutor de cálculo con 5 años de experiencia.',
            tutorCourses: [
              { courseId: 'c1', course: { id: 'c1', name: 'Cálculo I' } },
            ],
          },
        },
        {
          id: 2,
          name: 'Diana Profesora',
          profilePictureUrl: null,
          tutorProfile: {
            review: 4.2,
            numReview: 5,
            bio: 'Especialista en física moderna.',
            tutorCourses: [
              { courseId: 'c2', course: { id: 'c2', name: 'Física II' } },
            ],
          },
        },
      ],
    });
  });

  test('matches snapshot of search results', async ({ page }) => {
    await page.goto('/home/buscar-tutores');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('tutor-search.png', { fullPage: true });
  });
});

// ─── Session History ────────────────────────────────────────────────

test.describe('Booking Flow — Session History', () => {
  test('matches snapshot for student with mixed past and upcoming sessions', async ({ page }) => {
    await loginAsStudent(page);

    await stubJson(page, '**/api/courses', {
      success: true,
      courses: [{ id: 'c1', name: 'Cálculo I' }],
    });

    await stubJson(page, '**/api/sessions**', {
      success: true,
      count: 2,
      sessions: [
        {
          id: 's_past',
          tutorId: 99,
          tutor: { id: 99, name: 'Carlos Tutor', email: 'carlos@test.co' },
          course: { id: 'c1', name: 'Cálculo I' },
          courseId: 'c1',
          status: 'Completed',
          startTimestamp: '2026-04-01T15:00:00.000Z',
          endTimestamp:   '2026-04-01T16:00:00.000Z',
          payments: [{ amount: '50000' }],
          reviews: [],
          pendingReview: { id: 'r1', rating: null, status: 'pending' },
        },
        {
          id: 's_future',
          tutorId: 99,
          tutor: { id: 99, name: 'Carlos Tutor', email: 'carlos@test.co' },
          course: { id: 'c1', name: 'Cálculo I' },
          courseId: 'c1',
          status: 'Accepted',
          startTimestamp: '2030-01-01T15:00:00.000Z',
          endTimestamp:   '2030-01-01T16:00:00.000Z',
          payments: [{ amount: '50000' }],
          reviews: [],
        },
      ],
    });

    await page.goto('/home/historial');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('session-history.png', { fullPage: true });
  });
});

// ─── SessionBookedModal (component-level visual via test page) ─────
//
// If you adopt Storybook later, point this at the story URL instead. For now
// we mount the modal via a tiny test-only page (e.g. /test/session-booked-modal)
// behind a feature flag, or skip until that page exists.
test.describe('Booking Flow — SessionBookedModal visual', () => {
  test.skip('matches snapshot of student-confirmation modal', async ({ page }) => {
    // Intentionally skipped — wire up once /test/session-booked-modal exists
    // (or migrate to Storybook + Chromatic).
    await page.goto('/test/session-booked-modal');
    await expect(page.locator('.session-booked-modal')).toHaveScreenshot('modal-student.png');
  });
});
