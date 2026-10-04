// @ts-check
/**
 * Events E2E (spec §10.4): the student flows against the real app — dev
 * server, local database and the Wompi sandbox. Every test creates its own
 * uniquely titled event through the admin API; afterAll cancels them so the
 * public listing does not fill up with leftovers.
 */

const { test, expect } = require('@playwright/test');
const {
  ADMIN_EMAIL,
  MEETING_URL,
  PASSWORD,
  STUDENT_EMAIL,
  apiLogin,
  cancelEvent,
  createAndPublishEvent,
  getEventPayments,
  getTutorId,
  issueVerificationToken,
  loginThroughForm,
  moveEventToPast,
  runId,
  useFreshClientIp,
} = require('./helpers');

const TUTOR_NAME = 'Tutor Aprobado Testing';

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

async function newEvent(overrides) {
  const event = await createAndPublishEvent(api, adminToken, overrides);
  createdEventIds.push(event.id);
  return event;
}

/** Wait until /eventos has rendered its list (cards or the empty state). */
async function waitForEventList(page) {
  await expect(
    page.locator('a[href^="/eventos/"]').or(page.getByText('No hay eventos próximos')).first(),
  ).toBeVisible();
}

test('evento gratis: anónimo → login → inscripción → encuesta → reseña en el perfil del tutor', async ({ page }) => {
  const title = `E2E gratis ${runId()}`;
  const comment = `Comentario E2E ${runId()}`;
  const event = await newEvent({ title });

  // Anonymous: the event is listed and opens from its card.
  await page.goto('/eventos');
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.locator('a[href^="/eventos/"]').filter({ hasText: title }).click();
  await expect(page).toHaveURL(new RegExp(`/eventos/${event.slug}$`));

  // "Inscribirme" sends an anonymous visitor to the login page…
  await page.getByRole('button', { name: 'Inscribirme' }).click();
  await expect(page).toHaveURL(/\/auth\/login\?returnTo=/);
  await loginThroughForm(page, STUDENT_EMAIL);

  // …and back to the event with the confirmation step open.
  await expect(page).toHaveURL(new RegExp(`/eventos/${event.slug}\\?inscribir=1`));
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Confirma tu inscripción' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirmar inscripción' }).click();
  await expect(dialog.getByRole('heading', { name: '¡Listo! Te inscribiste' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Entendido' }).click();

  await expect(page.getByText('Estás inscrito')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Entrar a la sesión' })).toHaveAttribute('href', MEETING_URL);

  // The event ends; the student's home shows the survey popup.
  await moveEventToPast(api, adminToken, event.id);
  await page.goto('/home');
  const survey = page.getByRole('dialog', { name: `¿Asististe a ${title}?` });
  await expect(survey).toBeVisible();
  await survey.getByRole('button', { name: 'Sí', exact: true }).click();
  await survey.getByRole('group', { name: 'Calificación del evento' }).getByRole('button', { name: '5 estrellas' }).click();
  await survey
    .getByRole('group', { name: `Calificación para ${TUTOR_NAME}` })
    .getByRole('button', { name: '5 estrellas' })
    .click();
  await survey.getByLabel(`Comentario para ${TUTOR_NAME} (opcional)`).fill(comment);
  await survey.getByRole('button', { name: 'Enviar respuestas' }).click();
  await expect(page.getByRole('heading', { name: '¡Gracias por tu opinión!' })).toBeVisible();

  // The review is public on the tutor's profile, tagged with the event title.
  const tutorId = await getTutorId(api, adminToken);
  await page.goto(`/home/buscar-tutores/tutor/${tutorId}`);
  await expect(page.locator('article').first()).toBeVisible();
  // "Recent" reviews are ordered by id (a random UUID), so the new one can be
  // on any page.
  const review = page.locator('article').filter({ hasText: comment });
  const next = page.getByRole('button', { name: 'Siguiente →' });
  for (let n = 2; !(await review.count()) && (await next.isVisible()) && (await next.isEnabled()); n++) {
    await next.click();
    await expect(page.getByText(new RegExp(`^Página ${n} de`))).toBeVisible();
  }
  await expect(review).toBeVisible();
  await expect(review).toContainText(title);
});

test('cuenta nueva: registro → verificación de correo → de vuelta al evento → inscripción', async ({ page }) => {
  const id = runId();
  const email = `e2e.${id}@calico.local`;
  const event = await newEvent({ title: `E2E registro ${id}` });

  await page.goto(`/eventos/${event.slug}`);
  await page.getByRole('button', { name: 'Inscribirme' }).click();
  await expect(page).toHaveURL(/\/auth\/login\?returnTo=/);
  await page.getByRole('link', { name: 'Regístrate' }).click();
  await expect(page).toHaveURL(/\/auth\/register/);

  await page.getByPlaceholder('Tu nombre').fill(`Estudiante E2E ${id}`);
  await page.getByPlaceholder('Número de teléfono').fill(`3${String(Date.now()).slice(-9)}`);
  const career = page.locator('select').filter({ has: page.locator('option', { hasText: 'Seleccione...' }) });
  await expect(career.locator('option')).not.toHaveCount(1); // careers loaded
  await career.selectOption({ index: 1 });
  await page.getByPlaceholder('Tu correo').fill(email);
  await page.getByPlaceholder('Tu contraseña', { exact: true }).fill(PASSWORD);
  await page.getByPlaceholder('Repite tu contraseña').fill(PASSWORD);
  await page.locator('#termsCheckbox').check();
  await page.getByRole('button', { name: 'Registrarme' }).click();
  await expect(page).toHaveURL(/\/auth\/verify-email/);

  // The link from the verification email.
  const token = await issueVerificationToken(email);
  await page.goto(`/auth/confirm-email?token=${token}`);
  await page.getByRole('button', { name: 'Confirmar mi correo' }).click();

  await expect(page).toHaveURL(new RegExp(`/eventos/${event.slug}\\?inscribir=1`));
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Confirmar inscripción' }).click();
  await expect(dialog.getByRole('heading', { name: '¡Listo! Te inscribiste' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Entendido' }).click();
  await expect(page.getByText('Estás inscrito')).toBeVisible();
});

test('evento pago con early-bird: checkout de Wompi sandbox', async ({ page, browser }) => {
  test.setTimeout(240_000); // Wompi sandbox round trips + possible admin rate-limit waits
  const title = `E2E pago ${runId()}`;
  const event = await newEvent({ title, price: 2000, earlyBirdSlots: 1, earlyBirdPercent: 10 });

  await page.goto(`/eventos/${event.slug}`);
  await page.getByRole('button', { name: /^Pagar e inscribirme \$\s?1\.800$/ }).click();
  await loginThroughForm(page, STUDENT_EMAIL);
  await expect(page).toHaveURL(new RegExp(`/eventos/${event.slug}\\?inscribir=1`));
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^Pagar \$\s?1\.800$/ }).click();

  // Wompi's widget (sandbox): method → buyer data (prefilled) → card → result.
  const wompi = page.frameLocator('iframe[src*="checkout.wompi.co"]');
  await wompi.getByText('Tarjeta débito o crédito').click({ timeout: 30_000 });
  await wompi.getByRole('button', { name: 'Continuar con tu pago' }).click();
  await wompi.locator('#cardNumber').fill('4242424242424242');
  await wompi.locator('#expirationMonth').selectOption('12');
  await wompi.locator('#expirationYear').selectOption(String((new Date().getFullYear() + 2) % 100));
  await wompi.locator('#code').fill('123');
  await wompi.locator('#cardHolder').fill('Estudiante Testing');
  // Wompi's checkboxes update asynchronously, so check() would report "did
  // not change its state"; click and assert instead.
  for (const id of ['#legalDocument', '#acceptance', '#acceptancePersonal']) {
    const box = wompi.locator(id);
    if (!(await box.isChecked())) await box.click();
    await expect(box).toBeChecked();
  }
  await wompi.getByRole('button', { name: 'Continuar con tu pago' }).click();
  await expect(wompi.getByText('¡Pago aprobado!')).toBeVisible({ timeout: 60_000 });
  await wompi.getByRole('button', { name: 'Volver al comercio' }).click();

  await expect(dialog.getByRole('heading', { name: '¡Listo! Te inscribiste' })).toBeVisible({ timeout: 45_000 });
  await dialog.getByRole('button', { name: 'Entendido' }).click();
  await expect(page.getByText('Estás inscrito')).toBeVisible();

  // Admin → event → "Pagos": one payment of $1.800 (2.000 − 10 %).
  const { payments } = await getEventPayments(api, adminToken, event.id);
  expect(payments.map((p) => p.amount)).toEqual([1800]);

  const adminContext = await browser.newContext();
  await useFreshClientIp(adminContext);
  const admin = await adminContext.newPage();
  await admin.goto(`/auth/login?returnTo=${encodeURIComponent(`/home/admin/eventos/${event.id}`)}`);
  await loginThroughForm(admin, ADMIN_EMAIL);
  await expect(admin).toHaveURL(new RegExp(`/home/admin/eventos/${event.id}`));
  // Admin routes allow 30 requests / min per admin; right after another run
  // the page can come up rate-limited, so reload until the tab loads.
  await expect(async () => {
    await admin.reload();
    await admin.getByRole('button', { name: 'Pagos', exact: true }).click({ timeout: 10_000 });
    await expect(admin.getByRole('row').filter({ hasText: STUDENT_EMAIL })).toContainText(/\$\s?1\.800/, {
      timeout: 10_000,
    });
  }).toPass({ intervals: [15_000], timeout: 90_000 });
  await adminContext.close();
});

test('evento oculto: no aparece en /eventos y se abre por su enlace', async ({ page }) => {
  const title = `E2E oculto ${runId()}`;
  const event = await newEvent({ title, isListed: false });

  await page.goto('/eventos');
  await waitForEventList(page);
  await expect(page.getByRole('heading', { name: title })).toHaveCount(0);

  await page.goto(`/eventos/${event.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inscribirme' })).toBeVisible();
});
