// @ts-check
/**
 * Links as study material E2E: the admin adds the recording of a repaso; a student
 * gets it only after the survey and opens it in a new tab; the admin removes it.
 * Runs against the dev server and a local database, like events.spec.js.
 */

const { test, expect } = require('@playwright/test');
const {
  ADMIN_EMAIL,
  STUDENT_EMAIL,
  apiLogin,
  cancelEvent,
  createAndPublishEvent,
  loginThroughForm,
  moveEventToPast,
  runId,
  useFreshClientIp,
} = require('./helpers');

const LINK_NAME = 'Grabación del repaso';
const LINK_URL = 'https://zoom.us/rec/share/e2e?pwd=1';

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
  await useFreshClientIp(context);
});

/** The Material tab of an event, with the admin logged in. */
async function openMaterialTab(page, eventId) {
  await page.goto(`/auth/login?returnTo=${encodeURIComponent(`/home/admin/eventos/${eventId}`)}`);
  await loginThroughForm(page, ADMIN_EMAIL);
  await expect(page).toHaveURL(new RegExp(`/home/admin/eventos/${eventId}`));
  await page.getByRole('button', { name: 'Material', exact: true }).click();
}

async function fillLinkDialog(page, name, url) {
  const dialog = page.getByRole('alertdialog');
  await dialog.getByLabel('Nombre').fill(name);
  await dialog.getByLabel('Enlace').fill(url);
  await dialog.getByRole('button', { name: 'Agregar', exact: true }).click();
  return dialog;
}

test('el admin agrega la grabación y el estudiante la abre solo después de la encuesta', async ({ page, browser }, testInfo) => {
  const event = await createAndPublishEvent(api, adminToken, { title: `E2E link de material ${runId()}` });
  createdEventIds.push(event.id);
  await moveEventToPast(api, adminToken, event.id);

  await openMaterialTab(page, event.id);
  await page.getByRole('button', { name: 'Agregar link' }).click();

  // Something that is not an https link is explained and nothing is added.
  const dialog = await fillLinkDialog(page, LINK_NAME, 'javascript:alert(1)');
  await expect(dialog.getByRole('alert')).toHaveText('Pega el enlace completo, empezando por https://');

  await dialog.getByLabel('Enlace').fill(`  ${LINK_URL} `);
  await dialog.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(page.getByText(`${LINK_NAME} agregado como material.`)).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);

  const adminOpen = page.getByRole('link', { name: 'Abrir', exact: true });
  await expect(adminOpen).toHaveAttribute('href', LINK_URL);
  await expect(adminOpen).toHaveAttribute('target', '_blank');

  // The same link twice is refused by the server.
  await page.getByRole('button', { name: 'Agregar link' }).click();
  const again = await fillLinkDialog(page, 'Otra vez', LINK_URL);
  await expect(again.getByRole('alert')).toHaveText('Otra vez: ya está en este evento.');
  await again.getByRole('button', { name: 'Volver' }).click();

  // A student joins with the attendance link, so the survey is pending.
  const openLink = await api.post(`/api/admin/events/${event.id}/attendance-link`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const { attendanceCode } = (await openLink.json()).event;
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL, locale: 'es-CO', timezoneId: 'America/Bogota',
  });
  await useFreshClientIp(context);
  // Where the link goes is not under test: answer locally.
  await context.route('https://zoom.us/**', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Zoom</h1>' }));
  const student = await context.newPage();
  await student.goto(`/eventos/${event.slug}?asistencia=${attendanceCode}`);
  await student.getByRole('button', { name: 'Ya tengo cuenta' }).click();
  await loginThroughForm(student, STUDENT_EMAIL);

  // Locked: the URL is nowhere, neither on the page nor from the API.
  const survey = student.getByRole('dialog', { name: /^¿Asististe a/ });
  await expect(survey).toBeVisible();
  const token = await apiLogin(api, STUDENT_EMAIL);
  const locked = await api.get(`/api/events/${event.slug}/materials`, { headers: { Authorization: `Bearer ${token}` } });
  expect(locked.status()).toBe(403);
  expect(await student.content()).not.toContain('zoom.us');

  await survey.getByRole('button', { name: 'No', exact: true }).click();
  await survey.getByRole('button', { name: 'Redes sociales', exact: false }).click();
  await survey.getByRole('button', { name: 'Enviar respuestas' }).click();

  // Unlocked: named, shows where it goes, and opens in a new tab with no way back.
  await expect(student.getByText(LINK_NAME)).toBeVisible();
  await expect(student.getByText('zoom.us', { exact: true })).toBeVisible();
  const [recording] = await Promise.all([
    context.waitForEvent('page'),
    student.getByRole('link', { name: `Abrir ${LINK_NAME} en una pestaña nueva` }).click(),
  ]);
  await expect(recording).toHaveURL(LINK_URL);
  expect(await recording.evaluate(() => window.opener)).toBeNull();
  await recording.close();

  // The admin removes it: students lose it at once.
  await page.getByRole('button', { name: `Eliminar ${LINK_NAME}` }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('El enlace original no se toca.');
  await confirm.getByRole('button', { name: 'Sí, eliminar' }).click();
  await expect(page.getByText('Todavía no hay material.')).toBeVisible();

  await student.reload();
  await expect(student.getByRole('heading', { name: 'Material de estudio' })).toHaveCount(0);

  await context.close();
});
