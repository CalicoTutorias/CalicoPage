// @ts-check
/**
 * Pausing a course E2E: a tutor pauses an approved course from /tutor/materias,
 * students can neither find nor book it, an admin sees it paused and cannot turn
 * it back on, and the tutor resumes it without asking anyone. Runs against the
 * dev server and a local database, like events.spec.js.
 */

const { test, expect } = require('@playwright/test');
const {
  ADMIN_EMAIL,
  STUDENT_EMAIL,
  TUTOR_EMAIL,
  apiLogin,
  dbQuery,
  getTutorId,
  loginThroughForm,
  useFreshClientIp,
} = require('./helpers');

/** One request context per person: logging in leaves a session cookie behind. */
/** @type {import('@playwright/test').APIRequestContext[]} */
const contexts = [];
/** @type {import('@playwright/test').APIRequestContext} */
let visitor;
let studentApi;
let studentToken;
let tutorId;
let course;

// With no session on purpose: the search leaves the logged-in user out of their own results.
const tutorsFor = async (courseId) => {
  const res = await visitor.get(`/api/users/tutors?courseId=${courseId}`);
  return (await res.json()).tutors.map((t) => t.id);
};

test.beforeAll(async ({ playwright }, testInfo) => {
  const newContext = async () => {
    const context = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
    contexts.push(context);
    return context;
  };
  visitor = await newContext();
  const adminApi = await newContext();
  tutorId = await getTutorId(adminApi, await apiLogin(adminApi, ADMIN_EMAIL));
  studentApi = await newContext();
  studentToken = await apiLogin(studentApi, STUDENT_EMAIL);

  const tutorApi = await newContext();
  const tutorToken = await apiLogin(tutorApi, TUTOR_EMAIL);
  const res = await tutorApi.get('/api/tutor/courses?status=Approved', { headers: { Authorization: `Bearer ${tutorToken}` } });
  [{ course }] = (await res.json()).courses;
});

test.afterAll(async () => {
  // A failed run must not leave the seeded tutor with the course paused.
  await dbQuery(
    `UPDATE tutor_courses SET status = 'Approved' WHERE tutor_id = $1 AND course_id = $2`,
    [tutorId, course.id],
  );
  await Promise.all(contexts.map((context) => context.dispose()));
});

test.beforeEach(async ({ context }) => {
  await useFreshClientIp(context);
});

test('el tutor pausa una materia, los estudiantes no la encuentran ni la reservan, y la reactiva solo', async ({ page, browser }, testInfo) => {
  expect(await tutorsFor(course.id)).toContain(tutorId);

  await page.goto('/auth/login?returnTo=%2Ftutor%2Fmaterias');
  await loginThroughForm(page, TUTOR_EMAIL);
  await expect(page).toHaveURL(/\/tutor\/materias/);

  const card = page.locator('div.grid > div').filter({ has: page.getByRole('heading', { name: course.name }) });
  await expect(card.getByText('Aprobada')).toBeVisible();

  await card.getByRole('button', { name: `Pausar ${course.name}` }).click();

  // Paused: says what it means, keeps the approval's details, and cannot be removed by mistake.
  await expect(card.getByText('Pausada')).toBeVisible();
  await expect(card.getByText(/no te ven ni te pueden reservar/)).toBeVisible();
  await expect(card.getByText('Precio Calico')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Retirar' })).toHaveCount(0);
  await page.getByRole('button', { name: /^Pausadas/ }).click();
  await expect(card).toBeVisible();

  // Students: not in the search, not on the tutor's profile, not bookable.
  expect(await tutorsFor(course.id)).not.toContain(tutorId);
  const profile = await (await visitor.get(`/api/tutors/${tutorId}`)).json();
  expect(JSON.stringify(profile)).not.toContain(course.id);

  const start = new Date(Date.now() + 7 * 24 * 3_600_000);
  const intent = await studentApi.post('/api/payments/create-intent', {
    headers: { Authorization: `Bearer ${studentToken}` },
    data: {
      tutorId,
      courseId: course.id,
      topicsToReview: 'Una página que quedó abierta',
      startTimestamp: start.toISOString(),
      endTimestamp: new Date(start.getTime() + 3_600_000).toISOString(),
    },
  });
  expect(intent.status()).toBe(409);
  expect((await intent.json()).error).toBe('COURSE_NOT_OFFERED');

  // Admin: sees it paused, can still reject it, cannot switch it back on.
  const adminContext = await browser.newContext({
    baseURL: testInfo.project.use.baseURL, locale: 'es-CO', timezoneId: 'America/Bogota',
  });
  await useFreshClientIp(adminContext);
  const admin = await adminContext.newPage();
  await admin.goto(`/auth/login?returnTo=${encodeURIComponent(`/home/admin/tutors/${tutorId}`)}`);
  await loginThroughForm(admin, ADMIN_EMAIL);
  const row = admin.locator('li').filter({ hasText: course.name });
  await expect(row.getByText('Paused')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Aprobar' })).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Rechazar' })).toBeVisible();
  await adminContext.close();

  // The tutor resumes it with no admin involved, and is back in the search.
  await card.getByRole('button', { name: `Reactivar ${course.name}` }).click();
  await expect(page.getByText('No tienes materias pausadas.')).toBeVisible();
  await page.getByRole('button', { name: /^Aprobadas/ }).click();
  await expect(card.getByText('Aprobada')).toBeVisible();
  expect(await tutorsFor(course.id)).toContain(tutorId);
});
