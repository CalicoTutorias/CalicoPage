// @ts-check
/**
 * Helpers for the events E2E suite (spec §10.4): admin API setup through the
 * running dev server, plus direct access to the LOCAL database from .env for
 * the email-verification token.
 */

const crypto = require('node:crypto');
const path = require('node:path');
const { Client } = require('pg');
const { resolveTestDatabase } = require('../src/__integration__/helpers/testDatabaseUrl');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const PASSWORD = 'CalicoTest123!';
const ADMIN_EMAIL = 'admin.test@calico.local';
const STUDENT_EMAIL = 'student.test@calico.local';
const TUTOR_EMAIL = 'tutor.test@calico.local';
const MEETING_URL = 'https://meet.google.com/e2e-test';

const HOUR_MS = 60 * 60 * 1000;

/** Unique suffix so reruns never collide on titles / emails. */
function runId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * A random client IP sent as `x-real-ip` on auth calls. The dev server's
 * in-memory per-IP limits (login 10 / 15 min, register 5 / h) would otherwise
 * trip after a few reruns; the rate limiter is not what this suite tests.
 */
function freshClientIp() {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  return `10.${octet()}.${octet()}.${octet()}`;
}

/** Route the browser's /api/auth/* calls through one fresh client IP. */
async function useFreshClientIp(context) {
  const ip = freshClientIp();
  await context.route('**/api/auth/**', (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-real-ip': ip } }),
  );
}

async function json(res, what) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok() || body.success === false) {
    throw new Error(`${what} failed (${res.status()}): ${JSON.stringify(body)}`);
  }
  return body;
}

/** POST /api/auth/login → JWT. */
async function apiLogin(request, email, password = PASSWORD) {
  const res = await request.post('/api/auth/login', {
    data: { email, password },
    headers: { 'x-real-ip': freshClientIp() },
  });
  const body = await json(res, `login ${email}`);
  return body.token;
}

/**
 * Admin API call → parsed body. Admin routes allow 30 requests / min per
 * admin, which back-to-back reruns can exceed: a 429 is waited out once.
 */
async function admin(request, token, method, url, { data, params } = {}) {
  const send = () =>
    request.fetch(url, { method, data, params, headers: { Authorization: `Bearer ${token}` } });
  let res = await send();
  if (res.status() === 429) {
    await new Promise((resolve) => setTimeout(resolve, (Number(res.headers()['retry-after']) || 60) * 1000));
    res = await send();
  }
  return json(res, `${method} ${url}`);
}

let tutorIdCache;

/** Id of the approved test tutor (tutor.test@calico.local). */
async function getTutorId(request, token) {
  if (tutorIdCache) return tutorIdCache;
  const { tutors } = await admin(request, token, 'GET', '/api/admin/tutors', {
    params: { status: 'active', search: 'tutor.test' },
  });
  const tutor = tutors.find((t) => t.email === TUTOR_EMAIL);
  if (!tutor) throw new Error(`${TUTOR_EMAIL} is not an active approved tutor — run pnpm db:seed:test`);
  tutorIdCache = tutor.id;
  return tutor.id;
}

/**
 * Create a virtual event (manual Meet link, tutor.test) through the admin API
 * and publish it. Starts in 3 days, lasts 2 h, free unless overridden.
 * @returns {Promise<object>} the published admin event (id, slug, title…)
 */
async function createAndPublishEvent(request, token, overrides = {}) {
  const tutorId = await getTutorId(request, token);
  const startsAt = new Date(Date.now() + 72 * HOUR_MS);
  const endsAt = new Date(startsAt.getTime() + 2 * HOUR_MS);

  const { event } = await admin(request, token, 'POST', '/api/admin/events', {
    data: {
      title: `E2E evento ${runId()}`,
      description: 'Evento creado por la suite E2E de Playwright.',
      tutorIds: [tutorId],
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      modality: 'Virtual',
      autoMeet: false,
      meetingUrl: MEETING_URL,
      price: 0,
      earlyBirdSlots: null,
      earlyBirdPercent: null,
      isListed: true,
      ...overrides,
    },
  });
  const published = await admin(request, token, 'POST', `/api/admin/events/${event.id}/publish`);
  return published.event;
}

/** Move a published event to the past: started 3 h ago, ended 1 h ago. */
async function moveEventToPast(request, token, id) {
  const now = Date.now();
  const { event } = await admin(request, token, 'PATCH', `/api/admin/events/${id}`, {
    data: {
      startsAt: new Date(now - 3 * HOUR_MS).toISOString(),
      endsAt: new Date(now - HOUR_MS).toISOString(),
    },
  });
  return event;
}

/** Cancel an event (cleanup). Never throws: leftovers are tolerated. */
async function cancelEvent(request, token, id) {
  await admin(request, token, 'POST', `/api/admin/events/${id}/cancel`, {
    data: { reason: 'Limpieza E2E' },
  }).catch((err) => {
    console.warn(`[e2e cleanup] could not cancel event ${id}: ${err.message}`);
  });
}

/** GET /api/admin/events/[id]/payments → { payments, totals }. */
async function getEventPayments(request, token, id) {
  return admin(request, token, 'GET', `/api/admin/events/${id}/payments`);
}

/**
 * Query the local DATABASE_URL from .env. Before connecting, the URL must
 * pass the integration suite's guard: postgres protocol, no query string or
 * fragment, host `localhost` / `127.0.0.1`. The client is built from the
 * parsed parts, never from the raw string. (`|| ''`: an unset variable must
 * be refused, not fall back to the guard's default URL.)
 */
async function dbQuery(sql, params = []) {
  const { host, port, user, password, database } = resolveTestDatabase(process.env.DATABASE_URL || '');
  const client = new Client({ host, port, user, password, database });
  await client.connect();
  try {
    const { rows } = await client.query(sql, params);
    return rows;
  } finally {
    await client.end();
  }
}

/**
 * Raw email-verification token for a freshly registered user. The users
 * table only keeps sha256(token) — the raw token travels in the email, which
 * is not sent locally (no Brevo key) — so this checks that registration
 * stored one and swaps it for the hash of a token the test knows. The expiry
 * set by registration is kept.
 */
async function issueVerificationToken(email) {
  const [user] = await dbQuery(
    'SELECT verification_token FROM users WHERE email = $1 AND is_email_verified = false',
    [email],
  );
  if (!user?.verification_token) throw new Error(`No pending verification token for ${email}`);
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  await dbQuery('UPDATE users SET verification_token = $1 WHERE email = $2', [hash, email]);
  return token;
}

/** Log in through the real login form (the page must already be on it). */
async function loginThroughForm(page, email, password = PASSWORD) {
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
}

module.exports = {
  PASSWORD,
  ADMIN_EMAIL,
  STUDENT_EMAIL,
  TUTOR_EMAIL,
  MEETING_URL,
  runId,
  useFreshClientIp,
  apiLogin,
  getTutorId,
  createAndPublishEvent,
  moveEventToPast,
  cancelEvent,
  getEventPayments,
  dbQuery,
  issueVerificationToken,
  loginThroughForm,
};
