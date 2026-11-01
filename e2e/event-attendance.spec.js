// @ts-check
/**
 * Attendance link E2E: a free event that already took place, with nobody
 * registered. The admin generates a private link; whoever opens it signs in,
 * joins the event, answers the survey and only then gets the material. Runs
 * against the dev server and a local database, like events.spec.js.
 */

const { test, expect } = require('@playwright/test');
const {
  ADMIN_EMAIL,
  PASSWORD,
  STUDENT_EMAIL,
  TUTOR_EMAIL,
  apiLogin,
  cancelEvent,
  createAndPublishEvent,
  dbQuery,
  getEventRegistrations,
  getTutorId,
  issueVerificationToken,
  loginThroughForm,
  moveEventToPast,
  runId,
  useFreshClientIp: routeThroughFreshClientIp,
} = require('./helpers');

const TUTOR_NAME = 'Tutor Aprobado Testing';
const FILE_NAME = 'repaso-ip-nivel-3.pdf';

/** @type {import('@playwright/test').APIRequestContext} */
let api;
let adminToken;
const createdEventIds = [];

test.beforeAll(async ({ playwright }, testInfo) => {
  api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  adminToken = await apiLogin(api, ADMIN_EMAIL);
});

test.afterAll(async () => {
  for (const id of createdEventIds) await cancelEvent(api, adminToken, id);
  await api?.dispose();
});

test.beforeEach(async ({ context }) => {
  await routeThroughFreshClientIp(context);
});

/** A published free event that already ended, with one material file. */
async function endedEventWithMaterial(title) {
  const event = await createAndPublishEvent(api, adminToken, { title });
  createdEventIds.push(event.id);
  await moveEventToPast(api, adminToken, event.id);
  await dbQuery(
    `INSERT INTO event_materials (id, event_id, s3_key, file_name, mime_type, file_size)
     VALUES (gen_random_uuid(), $1, $2, $3, 'application/pdf', 1877426)`,
    [event.id, `event-materials/e2e/${event.slug}/${FILE_NAME}`, FILE_NAME],
  );
  return event;
}

/** Generate the link through the admin UI. @returns its same-origin path */
async function generateLink(page, event) {
  await page.goto(`/auth/login?returnTo=${encodeURIComponent(`/home/admin/eventos/${event.id}`)}`);
  await loginThroughForm(page, ADMIN_EMAIL);
  await expect(page).toHaveURL(new RegExp(`/home/admin/eventos/${event.id}`));
  const input = page.getByLabel('Link de asistencia');
  // Admin routes allow 30 requests / min per admin, which reruns can exceed.
  await expect(async () => {
    await page.getByRole('button', { name: 'Generar link de asistencia' }).click({ timeout: 5_000 });
    await expect(input).toHaveValue(/\?asistencia=/, { timeout: 5_000 });
  }).toPass({ timeout: 90_000, intervals: [10_000] });
  const url = new URL(await input.inputValue());
  return `${url.pathname}${url.search}`;
}

async function isolatedPage(browser, baseURL) {
  const context = await browser.newContext({ baseURL, locale: 'es-CO', timezoneId: 'America/Bogota' });
  await routeThroughFreshClientIp(context);
  return context.newPage();
}

async function fillRegisterForm(page, id, email) {
  await page.getByPlaceholder('Tu nombre').fill(`Asistente E2E ${id}`);
  const career = page.locator('select').filter({ has: page.locator('option', { hasText: 'Seleccione...' }) });
  await expect(career.locator('option')).not.toHaveCount(1); // careers loaded
  await career.selectOption({ index: 1 });
  await page.getByPlaceholder('Tu correo').fill(email);
  await page.getByPlaceholder('Tu contraseña', { exact: true }).fill(PASSWORD);
  await page.getByPlaceholder('Repite tu contraseña').fill(PASSWORD);
  await page.locator('#termsCheckbox').check();
}

async function answerAttended(survey, comment) {
  await survey.getByRole('button', { name: 'Sí', exact: true }).click();
  await survey.getByRole('group', { name: 'Calificación del evento' }).getByRole('button', { name: '5 estrellas' }).click();
  await survey.getByRole('button', { name: 'Redes sociales', exact: false }).click();
  await survey.getByRole('button', { name: 'Sí', exact: true }).last().click();
  await survey
    .getByRole('group', { name: `Calificación para ${TUTOR_NAME}` })
    .getByRole('button', { name: '4 estrellas' })
    .click();
  await survey.getByLabel(`Comentario para ${TUTOR_NAME} (opcional)`).fill(comment);
  await survey.getByRole('button', { name: 'Enviar respuestas' }).click();
}

/** Page through the tutor's public reviews looking for a comment ("Recent" is ordered by random UUID). */
async function findPublicReview(page, comment) {
  const tutorId = await getTutorId(api, adminToken);
  await page.goto(`/home/buscar-tutores/tutor/${tutorId}`);
  await expect(page.getByRole('heading', { name: TUTOR_NAME }).first()).toBeVisible();
  const review = page.locator('article').filter({ hasText: comment });
  const next = page.getByRole('button', { name: 'Siguiente →' });
  for (let n = 2; !(await review.count()) && (await next.isVisible()) && (await next.isEnabled()); n++) {
    await next.click();
    await expect(page.getByText(new RegExp(`^Página ${n} de`))).toBeVisible();
  }
  return review;
}

test('cuenta nueva con el correo abierto en otro navegador: encuesta → material → reseña pública → el admin la elimina', async ({ page, browser }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  const id = runId();
  const title = `E2E asistencia ${id}`;
  const comment = `Comentario asistencia ${id}`;
  const email = `e2e.asistencia.${id}@calico.local`;
  const event = await endedEventWithMaterial(title);
  const path = await generateLink(page, event);

  // Anonymous visitor: explained, not bounced to a dead end.
  const visitor = await isolatedPage(browser, baseURL);
  await visitor.goto(path);
  await expect(visitor.getByText('Este repaso ya terminó')).toBeVisible();
  await visitor.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await expect(visitor).toHaveURL(/\/auth\/register\?returnTo=/);
  await fillRegisterForm(visitor, id, email);

  // The typed password never reaches localStorage.
  const stored = await visitor.evaluate(() => localStorage.getItem('register_form_data'));
  expect(stored).not.toContain(PASSWORD);

  await visitor.getByRole('button', { name: 'Registrarme' }).click();
  await expect(visitor).toHaveURL(/\/auth\/verify-email\?.*returnTo=/);

  // The email is opened elsewhere: no pending-booking entry, no cookie. The
  // link itself has to bring the person back.
  const token = await issueVerificationToken(email);
  const mail = await isolatedPage(browser, baseURL);
  await mail.goto(`/auth/confirm-email?token=${token}&returnTo=${encodeURIComponent(path)}`);
  await mail.getByRole('button', { name: 'Confirmar mi correo' }).click();
  await expect(mail).toHaveURL(new RegExp(`/eventos/${event.slug}\\?asistencia=`));

  // Joined, and the survey opens by itself. The material is still locked.
  const survey = mail.getByRole('dialog', { name: `¿Asististe a ${title}?` });
  await expect(survey).toBeVisible();
  const locked = await mail.request.get(`/api/events/${event.slug}/materials`);
  expect(locked.status()).toBe(403);

  await answerAttended(survey, comment);
  await expect(mail.getByRole('heading', { name: '¡Gracias por tu opinión!' })).toBeVisible();

  // The material opens after the survey (the thanks closes by itself).
  await expect(mail.getByText(FILE_NAME)).toBeVisible();
  const list = await (await mail.request.get(`/api/events/${event.slug}/materials`)).json();
  const download = await mail.request.get(`/api/events/${event.slug}/materials/${list.materials[0].id}/download`);
  expect(download.status()).toBe(200);
  expect((await download.json()).url).toContain(encodeURIComponent(FILE_NAME).slice(0, 10));

  // The attendee list exists now, tagged with where it came from.
  const { registrations } = await getEventRegistrations(api, adminToken, event.id);
  expect(registrations).toEqual([
    expect.objectContaining({ email, status: 'Confirmed', source: 'asistencia', finalAmount: 0, surveyAnswered: true, attended: true }),
  ]);

  // Public on the tutor's profile, tagged with the event title.
  const review = await findPublicReview(mail, comment);
  await expect(review).toBeVisible();
  await expect(review).toContainText(title);

  // The admin removes it.
  await page.goto(`/home/admin/eventos/${event.id}`);
  await page.getByRole('button', { name: 'Encuesta', exact: true }).click();
  await expect(page.getByText(comment)).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`Eliminar la reseña de Asistente E2E ${id}`) }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sí, eliminar' }).click();
  await expect(page.getByText(comment)).toHaveCount(0);

  await expect(await findPublicReview(mail, comment)).toHaveCount(0);

  // The student keeps the material and cannot answer again.
  await mail.goto(path);
  await expect(mail.getByText(FILE_NAME)).toBeVisible();
  await expect(survey).toHaveCount(0);

  await visitor.context().close();
  await mail.context().close();
});

test('cuenta existente que no asistió: entra, responde que no, descarga y no deja reseñas', async ({ page, browser }, testInfo) => {
  const id = runId();
  const title = `E2E no asistí ${id}`;
  const event = await endedEventWithMaterial(title);
  const path = await generateLink(page, event);

  const student = await isolatedPage(browser, testInfo.project.use.baseURL);
  await student.goto(path);
  await student.getByRole('button', { name: 'Ya tengo cuenta' }).click();
  await loginThroughForm(student, STUDENT_EMAIL);
  await expect(student).toHaveURL(new RegExp(`/eventos/${event.slug}\\?asistencia=`));

  const survey = student.getByRole('dialog', { name: `¿Asististe a ${title}?` });
  await expect(survey).toBeVisible();
  await survey.getByRole('button', { name: 'No', exact: true }).click();
  await survey.getByRole('button', { name: 'Redes sociales', exact: false }).click();
  await survey.getByRole('button', { name: 'Enviar respuestas' }).click();
  await expect(student.getByText('¡Gracias por responder la encuesta!')).toBeVisible();

  await expect(student.getByText(FILE_NAME)).toBeVisible();
  const [{ n }] = await dbQuery('SELECT COUNT(*)::int AS n FROM reviews WHERE event_id = $1', [event.id]);
  expect(n).toBe(0);

  await student.context().close();
});

test('el tutor lee sus reseñas en Estadísticas y la notificación lo lleva ahí', async ({ page, playwright }, testInfo) => {
  const id = runId();
  const comment = `Reseña para Estadísticas ${id}`;
  const event = await createAndPublishEvent(api, adminToken, { title: `E2E estadísticas ${id}` });
  createdEventIds.push(event.id);
  await moveEventToPast(api, adminToken, event.id);

  // Another student rates the tutor, in a context of its own so its session
  // cookie does not replace the admin's.
  const studentApi = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  const studentToken = await apiLogin(studentApi, STUDENT_EMAIL);
  const headers = { Authorization: `Bearer ${studentToken}` };
  const openLink = await api.post(`/api/admin/events/${event.id}/attendance-link`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const { attendanceCode } = (await openLink.json()).event;
  expect((await studentApi.post(`/api/events/${event.slug}/attendance`, { headers, data: { code: attendanceCode } })).status()).toBe(200);
  const tutorId = await getTutorId(api, adminToken);
  const survey = await studentApi.post(`/api/events/${event.slug}/survey`, {
    headers,
    data: {
      attended: true,
      eventRating: 5,
      wouldRecommend: 'yes',
      heardFrom: 'social',
      tutorRatings: [{ tutorId, rating: 4, comment }],
    },
  });
  expect(survey.status()).toBe(201);
  await studentApi.dispose();

  await page.goto('/auth/login?returnTo=%2Ftutor%2Finicio');
  await loginThroughForm(page, TUTOR_EMAIL);
  await expect(page).toHaveURL(/\/tutor\/inicio/);

  await page.locator('.notification-btn').click();
  await page.getByText('Nueva reseña').first().click();

  await expect(page).toHaveURL(/\/tutor\/statistics#resenas$/);
  const section = page.locator('section#resenas');
  await expect(section).toBeInViewport();
  await expect(section.getByRole('heading', { name: 'Reseñas' })).toBeVisible();
  await expect(section.getByText(/reseñas? de tus tutorías y repasos/)).toBeVisible();

  // "Recent" is ordered by random UUID, so the new one can be on any page.
  const review = section.locator('article').filter({ hasText: comment });
  const next = section.getByRole('button', { name: 'Siguiente →' });
  for (let n = 2; !(await review.count()) && (await next.isVisible()) && (await next.isEnabled()); n++) {
    await next.click();
    await expect(section.getByText(new RegExp(`^Página ${n} de`))).toBeVisible();
  }
  await expect(review).toBeVisible();
  await expect(review).toContainText(event.title);

  // Tapping it again while already there has to bring the section back.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(section).not.toBeInViewport();
  await page.locator('.notification-btn').click();
  await page.getByText('Nueva reseña').first().click();
  await expect(section).toBeInViewport();
});

test('link cerrado: no inscribe a nadie', async ({ page, browser }, testInfo) => {
  const event = await endedEventWithMaterial(`E2E link cerrado ${runId()}`);
  const path = await generateLink(page, event);

  await page.getByRole('button', { name: 'Cerrar link' }).click();
  // A rate-limited attempt keeps the dialog open with its error: try again.
  await expect(async () => {
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sí, cerrar' }).click({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: 'Generar link de asistencia' })).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 90_000, intervals: [10_000] });

  const student = await isolatedPage(browser, testInfo.project.use.baseURL);
  await student.goto(path);
  await student.getByRole('button', { name: 'Ya tengo cuenta' }).click();
  await loginThroughForm(student, STUDENT_EMAIL);
  await expect(student.getByText('Este link ya no funciona')).toBeVisible();

  const { registrations } = await getEventRegistrations(api, adminToken, event.id);
  expect(registrations).toEqual([]);

  await student.context().close();
});
