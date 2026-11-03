/**
 * Session checkout end to end against a real Postgres: "the student is
 * charged but no tutoring session is created" must not be possible.
 *
 * Everything runs through the real route handlers (create-intent, webhook,
 * confirm-payment, status) with real JWTs, the real services/repositories
 * and the real Prisma client. Only the external boundaries are replaced:
 *   - Wompi's REST lookups (an in-memory ledger below). The webhook
 *     checksum is verified by the REAL verifyEventChecksum.
 *   - Google Calendar (returns a fixed Meet link) and Brevo emails.
 *   - Vercel's waitUntil: background work is collected and awaited after
 *     each test, as the platform keeps the function alive for it.
 * Assertions read the database state, not only the HTTP answers.
 */
import { createHash, randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import * as wompiApi from '@/lib/services/wompi-api.service';
import * as calendar from '@/lib/services/calico-calendar.service';
import * as emailService from '@/lib/services/email.service';
import * as sessionRepo from '@/lib/repositories/session.repository';
import * as paymentRepo from '@/lib/repositories/payment.repository';
import { POST as createIntentRoute } from '@/app/api/payments/create-intent/route';
import { POST as webhookRoute } from '@/app/api/payments/webhook/route';
import { POST as confirmPaymentRoute } from '@/app/api/payments/confirm-payment/route';
import { GET as statusRoute } from '@/app/api/payments/status/route';
import {
  resetSessionData,
  createUser,
  createCourse,
  createCoupon,
  createTutorWithAvailability,
  slotAt,
  bearer,
} from './helpers/factory';

jest.mock('@vercel/functions', () => {
  const pending = [];
  return {
    ...jest.requireActual('@vercel/functions'),
    waitUntil: (promise) => void pending.push(promise),
    __pending: pending,
  };
});
jest.mock('@/lib/services/wompi-api.service', () => ({
  ...jest.requireActual('@/lib/services/wompi-api.service'),
  fetchTransaction: jest.fn(),
  fetchTransactionsByReference: jest.fn(),
}));
jest.mock('@/lib/services/calico-calendar.service');
jest.mock('@/lib/services/email.service');
// Real repositories (re-armed with the real implementation before each
// test), wrapped only so test 12 can inject one transient failure.
jest.mock('@/lib/repositories/session.repository', () => {
  const actual = jest.requireActual('@/lib/repositories/session.repository');
  return { __esModule: true, ...actual, createSessionWithParticipant: jest.fn() };
});
jest.mock('@/lib/repositories/payment.repository', () => {
  const actual = jest.requireActual('@/lib/repositories/payment.repository');
  return { __esModule: true, ...actual, create: jest.fn() };
});

const EVENTS_SECRET = 'test_events_integration';
process.env.WOMPI_EVENTS_SECRET = EVENTS_SECRET;

const PRICE = 40000; // COP per hour
const PRICE_CENTS = PRICE * 100;
const MEET_LINK = 'https://meet.google.com/int-test-link';

// ─── Wompi (in-memory ledger behind the mocked REST lookups) ──────────

const ledger = new Map();

/** Wompi records a transaction for a checkout; returns it as its API would. */
function wompiCharges(intent, { status = 'APPROVED', amountInCents = intent.amountInCents } = {}) {
  const tx = {
    id: `int-tx-${randomUUID()}`,
    reference: intent.reference,
    amount_in_cents: amountInCents,
    currency: 'COP',
    status,
    metadata: {}, // Wompi's lookup does not echo our metadata
  };
  ledger.set(tx.id, tx);
  return tx;
}

function lookupFails() {
  return new Error('[wompi-api] Wompi returned HTTP 502: Bad Gateway');
}

/**
 * A `transaction.updated` event signed the way Wompi signs it: SHA-256 of the
 * values named in signature.properties (paths under `data`), then the
 * timestamp, then the events secret. The default properties are Wompi's
 * documented ones, which do NOT include the currency.
 */
function wompiEvent(
  tx,
  {
    properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
    secret = EVENTS_SECRET,
    timestamp = Math.floor(Date.now() / 1000),
  } = {},
) {
  const data = {
    transaction: {
      id: tx.id,
      status: tx.status,
      amount_in_cents: tx.amount_in_cents,
      reference: tx.reference,
      currency: tx.currency,
    },
  };
  const values = properties.map((path) => path.split('.').reduce((node, key) => node[key], data));
  const checksum = createHash('sha256')
    .update(`${values.join('')}${timestamp}${secret}`)
    .digest('hex')
    .toUpperCase(); // Wompi sends upper-case hex
  return {
    event: 'transaction.updated',
    data,
    environment: 'test',
    signature: { properties, checksum },
    timestamp,
    sent_at: new Date().toISOString(),
  };
}

// ─── HTTP entry points ────────────────────────────────────────────────

async function call(handler, request) {
  const res = await handler(request);
  return { status: res.status, body: await res.json() };
}

function postJson(path, body, user) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(user ? { authorization: bearer(user) } : {}) },
    body: JSON.stringify(body),
  });
}

const createIntent = (student, body) => call(createIntentRoute, postJson('/api/payments/create-intent', body, student));
const deliverWebhook = (event) => call(webhookRoute, postJson('/api/payments/webhook', event));
const confirmPayment = (student, tx) =>
  call(
    confirmPaymentRoute,
    postJson('/api/payments/confirm-payment', { reference: tx.reference, transactionData: { id: tx.id } }, student),
  );
const pollStatus = (student, reference) =>
  call(
    statusRoute,
    new Request(`http://localhost/api/payments/status?reference=${encodeURIComponent(reference)}`, {
      headers: { authorization: bearer(student) },
    }),
  );

// ─── Scenario + database state ────────────────────────────────────────

/** Tutor (Bogotá, 08:00–18:00 every day), a 40 000 COP/h course and a student. */
async function scenario() {
  const tutor = await createTutorWithAvailability();
  const course = await createCourse({ basePrice: PRICE });
  const student = await createUser({ name: 'Int Student' });
  const defaultSlot = slotAt(); // 3 days ahead, 10:00 Bogotá
  const booking = ({ slot = defaultSlot, ...extra } = {}) => ({
    tutorId: tutor.id,
    courseId: course.id,
    ...slot,
    topicsToReview: 'Integrales dobles',
    ...extra,
  });
  return { tutor, course, student, booking };
}

/** create-intent must succeed; returns the intent the widget is opened with. */
async function checkout(student, body) {
  const res = await createIntent(student, body);
  expect(res).toMatchObject({ status: 200, body: { success: true } });
  return res.body.intent;
}

async function bookingState(tutorId, reference) {
  const sessions = await prisma.session.findMany({ where: { tutorId }, include: { participants: true } });
  const payments = await prisma.payment.findMany({ where: { tutorId } });
  const intent = reference ? await prisma.paymentIntent.findUnique({ where: { reference } }) : null;
  return {
    sessions,
    active: sessions.filter((s) => !['Canceled', 'Rejected'].includes(s.status)),
    payments,
    intent,
  };
}

/** Exactly one active session and one paid payment for `tx`, intent consumed. */
async function expectBookedOnce({ tutor, student, tx }) {
  const state = await bookingState(tutor.id, tx.reference);
  expect(state.active).toHaveLength(1);
  const [session] = state.active;
  expect(session).toMatchObject({ status: 'Accepted', notes: `Booked via payment intent ${tx.reference}` });
  expect(session.participants.map((p) => p.studentId)).toEqual([student.id]);
  expect(state.payments).toHaveLength(1);
  expect(state.payments[0]).toMatchObject({
    sessionId: session.id,
    studentId: student.id,
    status: 'paid',
    wompiId: tx.id,
  });
  expect(Number(state.payments[0].amount)).toBe(tx.amount_in_cents / 100);
  expect(state.intent.consumedAt).not.toBeNull();
  return { session, payment: state.payments[0], state };
}

async function expectNothingBooked(tutorId, reference) {
  const state = await bookingState(tutorId, reference);
  expect(state.sessions).toHaveLength(0);
  expect(state.payments).toHaveLength(0);
  if (reference) expect(state.intent.consumedAt).toBeNull();
}

/** Await the waitUntil work (notifications, emails) the routes left behind. */
async function flushBackgroundWork() {
  const pending = jest.requireMock('@vercel/functions').__pending;
  while (pending.length) await Promise.allSettled(pending.splice(0));
}

/**
 * Holds the next Google Calendar call until `release()`: the booking that
 * makes it has committed its session and is waiting on Google, as a real
 * Calendar round trip does.
 */
function holdNextCalendarCall() {
  let release;
  let reached;
  const reachedCall = new Promise((resolve) => {
    reached = resolve;
  });
  calendar.createTutoringSessionEvent.mockImplementationOnce(() => {
    reached();
    return new Promise((resolve) => {
      release = () => resolve({ success: true, eventId: `int-evt-${randomUUID()}`, meetLink: MEET_LINK });
    });
  });
  return { reached: reachedCall, release: () => release() };
}

const writeConflict = () =>
  Object.assign(new Error('Transaction failed due to a write conflict or a deadlock. Please retry your transaction'), {
    code: 'P2034',
  });

beforeEach(async () => {
  await resetSessionData();
  ledger.clear();
  wompiApi.fetchTransaction.mockReset().mockImplementation(async (id) => {
    const tx = ledger.get(id);
    if (!tx) throw Object.assign(new Error(`[wompi-api] Transaction ${id} not found`), { code: 'NOT_FOUND' });
    return { ...tx };
  });
  wompiApi.fetchTransactionsByReference
    .mockReset()
    .mockImplementation(async (reference) =>
      [...ledger.values()].filter((tx) => tx.reference === reference).map((tx) => ({ ...tx })),
    );
  calendar.createTutoringSessionEvent
    .mockReset()
    .mockImplementation(async () => ({ success: true, eventId: `int-evt-${randomUUID()}`, meetLink: MEET_LINK }));
  emailService.sendSessionConfirmedEmail.mockReset().mockResolvedValue({ success: true });
  sessionRepo.createSessionWithParticipant
    .mockReset()
    .mockImplementation(jest.requireActual('@/lib/repositories/session.repository').createSessionWithParticipant);
  paymentRepo.create
    .mockReset()
    .mockImplementation(jest.requireActual('@/lib/repositories/payment.repository').create);
});
afterEach(flushBackgroundWork);
afterAll(() => prisma.$disconnect());

describe('session checkout: create-intent → Wompi → booking (real Postgres)', () => {
  // ── create-intent validates the slot BEFORE anything is charged ──────

  it.each([
    ['the same slot', '10:00'],
    ['a slot inside the tutor buffer', '11:10'],
  ])('1. create-intent for %s already booked by another student → 409 SESSION_CONFLICT, no intent, no coupon hold (guards: charging for a taken slot)', async (_, time) => {
    const s = await scenario();
    const first = await checkout(s.student, s.booking());
    expect((await deliverWebhook(wompiEvent(wompiCharges(first)))).status).toBe(200);
    const coupon = await createCoupon();
    const late = await createUser({ name: 'Int Late Student' });

    const res = await createIntent(late, s.booking({ slot: slotAt({ time }), couponCode: coupon.code }));

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, error: 'SESSION_CONFLICT' });
    expect(await prisma.paymentIntent.findMany({ select: { reference: true } })).toEqual([
      { reference: first.reference },
    ]);
    expect(await prisma.couponRedemption.count()).toBe(0);
    expect((await bookingState(s.tutor.id)).sessions).toHaveLength(1);
  });

  it.each([
    ['outside the tutor availability', 'OUTSIDE_AVAILABILITY', { time: '19:00' }, /disponibilidad/],
    ['at a disallowed minute (:15)', 'INVALID_TIMES', { time: '10:15' }, /:00, :10/],
    ['in the past', 'INVALID_TIMES', { daysFromToday: -1 }, /futuro/],
  ])('2. create-intent for a slot %s → 409 %s, nothing persisted (guards: charging for an unbookable slot)', async (_, code, when, message) => {
    const s = await scenario();
    const coupon = await createCoupon();

    const res = await createIntent(s.student, s.booking({ slot: slotAt(when), couponCode: coupon.code }));

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, error: code, message: expect.stringMatching(message) });
    expect(await prisma.paymentIntent.count()).toBe(0);
    expect(await prisma.couponRedemption.count()).toBe(0);
    await expectNothingBooked(s.tutor.id);
  });

  it('3. create-intent for a valid slot → 200, intent persisted with the frozen amount = course price × 1h (guards: client-controlled amount / identity)', async () => {
    const s = await scenario();
    const other = await createUser();

    // A tampered body: the amount and the studentId must both be ignored.
    const res = await createIntent(s.student, s.booking({ amount: 1, studentId: other.id }));

    expect(res.status).toBe(200);
    const { intent, pricing } = res.body;
    expect(pricing).toEqual({ originalAmount: PRICE, discountAmount: 0, amount: PRICE, couponCode: null });
    expect(intent.amountInCents).toBe(PRICE_CENTS);
    // The widget signature commits Wompi to exactly the frozen amount.
    const integrity = createHash('sha256')
      .update(`${intent.reference}${PRICE_CENTS}COP${process.env.WOMPI_INTEGRITY_SECRET}`)
      .digest('hex');
    expect(intent.signature).toBe(integrity);

    const stored = await prisma.paymentIntent.findUnique({ where: { reference: intent.reference } });
    expect(stored).toMatchObject({ kind: 'session', consumedAt: null });
    expect(stored.metadata).toMatchObject({
      studentId: s.student.id,
      tutorId: s.tutor.id,
      courseId: s.course.id,
      startTimestamp: s.booking().startTimestamp,
      endTimestamp: s.booking().endTimestamp,
      originalAmount: String(PRICE),
      discountAmount: '0',
    });
    await expectNothingBooked(s.tutor.id, intent.reference); // booked only after payment
  });

  // ── Webhook ──────────────────────────────────────────────────────────

  it('4. happy path: signed APPROVED webhook → 200; 1 Accepted session, 1 paid payment, intent consumed (guards: charged but not booked)', async () => {
    const s = await scenario();
    const tx = wompiCharges(await checkout(s.student, s.booking()));

    const res = await deliverWebhook(wompiEvent(tx));

    expect(res).toMatchObject({ status: 200, body: { success: true } });
    const { session } = await expectBookedOnce({ ...s, tx });
    expect(session.googleMeetLink).toBe(MEET_LINK);
    expect(session.startTimestamp.toISOString()).toBe(s.booking().startTimestamp);
    const profile = await prisma.tutorProfile.findUnique({ where: { userId: s.tutor.id } });
    expect(profile.numSessions).toBe(1);
    expect(Number(profile.nextPayment)).toBe(PRICE);
    await flushBackgroundWork();
    expect(await prisma.notification.count({ where: { userId: s.student.id, type: 'payment_confirmed' } })).toBe(1);
  });

  it('5. the same webhook delivered twice → second answer 200 success, still 1 session and 1 payment (guards: duplicate booking / false "paid but not booked" alert on Wompi retries)', async () => {
    const s = await scenario();
    const tx = wompiCharges(await checkout(s.student, s.booking()));
    const event = wompiEvent(tx);

    expect((await deliverWebhook(event)).status).toBe(200);
    const again = await deliverWebhook(event);

    expect(again).toMatchObject({ status: 200, body: { success: true } });
    await expectBookedOnce({ ...s, tx });
    const profile = await prisma.tutorProfile.findUnique({ where: { userId: s.tutor.id } });
    expect(profile.numSessions).toBe(1);
    expect(Number(profile.nextPayment)).toBe(PRICE);
    expect(calendar.createTutoringSessionEvent).toHaveBeenCalledTimes(1);
    await flushBackgroundWork();
    expect(await prisma.notification.count({ where: { userId: s.student.id, type: 'payment_confirmed' } })).toBe(1);
  });

  it('6. confirm-payment after the webhook already booked → 200 with the full session incl. googleMeetLink (guards: false "Meet link error" modal)', async () => {
    const s = await scenario();
    const tx = wompiCharges(await checkout(s.student, s.booking()));
    expect((await deliverWebhook(wompiEvent(tx))).status).toBe(200);

    const res = await confirmPayment(s.student, tx);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { session } = await expectBookedOnce({ ...s, tx });
    const returned = res.body.result.session;
    expect(returned).not.toBeNull();
    expect(returned).toMatchObject({ id: session.id, status: 'Accepted', googleMeetLink: MEET_LINK });
    expect(returned.course).toMatchObject({ id: s.course.id });
    expect(returned.participants.map((p) => p.studentId)).toEqual([s.student.id]);
  });

  it.each([
    ['webhook started first', true],
    ['confirm-payment started first', false],
  ])('7. webhook and confirm-payment for the same transaction concurrently (%s) → 1 session + 1 payment, neither answers 500 (guards: double booking / 500 on the race)', async (_, webhookFirst) => {
    const s = await scenario();
    const tx = wompiCharges(await checkout(s.student, s.booking()));
    const webhook = () => deliverWebhook(wompiEvent(tx));
    const confirm = () => confirmPayment(s.student, tx);

    const [hook, conf] = webhookFirst
      ? await Promise.all([webhook(), confirm()])
      : await Promise.all([confirm(), webhook()]).then(([c, w]) => [w, c]);

    expect(hook.status).not.toBe(500);
    expect(conf.status).not.toBe(500);
    // The webhook never reports a booked payment as "paid but not booked":
    // it succeeds, or (lost the race mid-booking) asks Wompi to retry, and the
    // redelivery succeeds.
    if (hook.status === 503) {
      expect(hook.body).toMatchObject({ error: 'PAYMENT_PROCESSING' });
      expect(await deliverWebhook(wompiEvent(tx))).toMatchObject({ status: 200, body: { success: true } });
    } else {
      expect(hook).toMatchObject({ status: 200, body: { success: true } });
    }
    const { session } = await expectBookedOnce({ ...s, tx });
    // The student gets the settled session (with its Meet link), or is told it
    // is still being confirmed.
    if (conf.status === 200) {
      expect(conf.body.result.session).toMatchObject({ id: session.id, googleMeetLink: MEET_LINK });
    } else {
      expect(conf).toMatchObject({ status: 409, body: { error: 'PAYMENT_PROCESSING' } });
    }
  });

  it('7. the webhook arriving while confirm-payment is still booking (inside the Google Calendar call) → 503 PAYMENT_PROCESSING (no "paid but not booked" alert); the redelivery succeeds, booked once', async () => {
    const s = await scenario();
    const tx = wompiCharges(await checkout(s.student, s.booking()));
    const google = holdNextCalendarCall();

    const confirming = confirmPayment(s.student, tx);
    await google.reached; // confirm-payment committed the session and waits on Google
    const hook = await deliverWebhook(wompiEvent(tx));
    google.release();
    const conf = await confirming;

    expect(hook).toMatchObject({ status: 503, body: { error: 'PAYMENT_PROCESSING' } });
    expect(conf).toMatchObject({ status: 200, body: { success: true } });
    const { session } = await expectBookedOnce({ ...s, tx });
    expect(conf.body.result.session).toMatchObject({ id: session.id, googleMeetLink: MEET_LINK });
    // Wompi's retry of the same event now finds the payment and succeeds.
    expect(await deliverWebhook(wompiEvent(tx))).toMatchObject({ status: 200, body: { success: true } });
    await expectBookedOnce({ ...s, tx });
  });

  // The request that loses the webhook/confirm race must not report the
  // winner's session before the winner stored its Meet link (or payment):
  // the student would see "Hubo un error al generar el enlace de Google Meet"
  // for a session that does get its link.
  describe('a request recovering the session while the winner is still creating its Meet link', () => {
    it('confirm-payment during the webhook\'s Google Calendar call → 200 only with the Meet link, otherwise 409 PAYMENT_PROCESSING', async () => {
      const s = await scenario();
      const tx = wompiCharges(await checkout(s.student, s.booking()));
      const google = holdNextCalendarCall();

      const hooking = deliverWebhook(wompiEvent(tx));
      await google.reached; // the webhook committed the session and waits on Google
      const conf = await confirmPayment(s.student, tx);
      google.release();
      expect(await hooking).toMatchObject({ status: 200, body: { success: true } });
      await expectBookedOnce({ ...s, tx });

      if (conf.status === 200) {
        expect(conf.body.result.session.googleMeetLink).toBe(MEET_LINK);
      } else {
        expect(conf).toMatchObject({ status: 409, body: { error: 'PAYMENT_PROCESSING' } });
      }
    });

    it('status poll during the webhook\'s Google Calendar call → confirmed only with the Meet link, otherwise pending', async () => {
      const s = await scenario();
      const tx = wompiCharges(await checkout(s.student, s.booking()));
      const google = holdNextCalendarCall();

      const hooking = deliverWebhook(wompiEvent(tx));
      await google.reached;
      const poll = await pollStatus(s.student, tx.reference);
      google.release();
      expect(await hooking).toMatchObject({ status: 200, body: { success: true } });
      await expectBookedOnce({ ...s, tx });

      expect(poll.status).toBe(200);
      if (poll.body.state === 'confirmed') {
        expect(poll.body.session.googleMeetLink).toBe(MEET_LINK);
      } else {
        expect(poll.body.state).toBe('pending');
      }
    });
  });

  it('8. Wompi lookup fails in the webhook → 503 and nothing written; the redelivery books exactly once (guards: webhook answering 200 and Wompi never retrying)', async () => {
    const s = await scenario();
    const tx = wompiCharges(await checkout(s.student, s.booking()));
    const event = wompiEvent(tx);
    wompiApi.fetchTransaction.mockRejectedValueOnce(lookupFails());

    const failed = await deliverWebhook(event);

    expect(failed).toMatchObject({ status: 503, body: { success: false } });
    await expectNothingBooked(s.tutor.id, tx.reference);

    const redelivered = await deliverWebhook(event);

    expect(redelivered).toMatchObject({ status: 200, body: { success: true } });
    await expectBookedOnce({ ...s, tx });
  });

  describe('9. webhook signature', () => {
    it.each([
      ['a tampered checksum', (tx) => ({ ...wompiEvent(tx), signature: { ...wompiEvent(tx).signature, checksum: 'A'.repeat(64) } })],
      ['a checksum signed with another secret', (tx) => wompiEvent(tx, { secret: 'not-the-events-secret' })],
      ['a body changed after signing', (tx) => {
        const event = wompiEvent(tx);
        event.data.transaction.amount_in_cents += 100;
        return event;
      }],
    ])('rejects %s → 401, Wompi not queried, nothing written (guards: forged events)', async (_, forge) => {
      const s = await scenario();
      const tx = wompiCharges(await checkout(s.student, s.booking()));

      const res = await deliverWebhook(forge(tx));

      expect(res).toMatchObject({ status: 401, body: { success: false, error: 'Invalid signature' } });
      expect(wompiApi.fetchTransaction).not.toHaveBeenCalled();
      await expectNothingBooked(s.tutor.id, tx.reference);
    });

    it('an event whose signature.properties do NOT include the currency validates and books (guards: old hardcoded-currency checksum rejecting every real event)', async () => {
      const s = await scenario();
      const tx = wompiCharges(await checkout(s.student, s.booking()));
      // Order and set of signed fields come from the event itself.
      const event = wompiEvent(tx, { properties: ['transaction.amount_in_cents', 'transaction.id', 'transaction.status'] });
      expect(event.data.transaction.currency).toBe('COP'); // present in the body, just not signed

      const res = await deliverWebhook(event);

      expect(res).toMatchObject({ status: 200, body: { success: true } });
      await expectBookedOnce({ ...s, tx });
    });
  });

  // ── Status polling (no webhook) ───────────────────────────────────────

  describe('10. GET /api/payments/status', () => {
    it('no webhook ever arrived, Wompi reports APPROVED → confirmed with the session, booked once; a second poll returns the same session (guards: paid but never booked when the webhook is lost)', async () => {
      const s = await scenario();
      const tx = wompiCharges(await checkout(s.student, s.booking()));

      const first = await pollStatus(s.student, tx.reference);

      expect(first).toMatchObject({ status: 200, body: { success: true, state: 'confirmed' } });
      const { session } = await expectBookedOnce({ ...s, tx });
      expect(first.body.session).toMatchObject({ id: session.id, googleMeetLink: MEET_LINK });

      const second = await pollStatus(s.student, tx.reference);

      expect(second).toMatchObject({ status: 200, body: { state: 'confirmed', session: { id: session.id } } });
      await expectBookedOnce({ ...s, tx });
    });

    it('Wompi reports PENDING → pending, nothing written', async () => {
      const s = await scenario();
      const tx = wompiCharges(await checkout(s.student, s.booking()), { status: 'PENDING' });

      const res = await pollStatus(s.student, tx.reference);

      expect(res).toMatchObject({ status: 200, body: { success: true, state: 'pending' } });
      expect(res.body.session).toBeUndefined();
      await expectNothingBooked(s.tutor.id, tx.reference);
    });

    it('every Wompi transaction DECLINED → failed, nothing written', async () => {
      const s = await scenario();
      const intent = await checkout(s.student, s.booking());
      wompiCharges(intent, { status: 'DECLINED' });
      wompiCharges(intent, { status: 'DECLINED' });

      const res = await pollStatus(s.student, intent.reference);

      expect(res).toMatchObject({ status: 200, body: { success: true, state: 'failed' } });
      await expectNothingBooked(s.tutor.id, intent.reference);
    });

    it("another student's reference → 403, Wompi not queried, nothing written (guards: IDOR on the status endpoint)", async () => {
      const s = await scenario();
      const tx = wompiCharges(await checkout(s.student, s.booking()));
      const intruder = await createUser({ name: 'Int Intruder' });

      const res = await pollStatus(intruder, tx.reference);

      expect(res).toMatchObject({ status: 403, body: { success: false, error: 'FORBIDDEN' } });
      expect(wompiApi.fetchTransactionsByReference).not.toHaveBeenCalled();
      await expectNothingBooked(s.tutor.id, tx.reference);
    });
  });

  // ── Two students, one slot ────────────────────────────────────────────

  it('11. two students pay for the same free slot → first booked; second webhook 200 (no retry loop), still ONE active session; second confirm-payment 409, not 500 (guards: double booking + 500 on a lost slot)', async () => {
    const s = await scenario();
    const rival = await createUser({ name: 'Int Rival Student' });
    // Both checkouts pass: the slot is free when each intent is created.
    const txA = wompiCharges(await checkout(s.student, s.booking()));
    const txB = wompiCharges(await checkout(rival, s.booking()));

    expect(await deliverWebhook(wompiEvent(txA))).toMatchObject({ status: 200, body: { success: true } });
    const lost = await deliverWebhook(wompiEvent(txB));

    expect(lost).toMatchObject({ status: 200, body: { success: false } });
    const { session } = await expectBookedOnce({ ...s, tx: txA });
    expect(session.participants.map((p) => p.studentId)).toEqual([s.student.id]);
    expect(await prisma.payment.count({ where: { wompiId: txB.id } })).toBe(0);
    expect((await prisma.paymentIntent.findUnique({ where: { reference: txB.reference } })).consumedAt).toBeNull();

    const confirmB = await confirmPayment(rival, txB);

    expect(confirmB.status).toBe(409);
    expect(confirmB.body.success).toBe(false);
    const after = await bookingState(s.tutor.id);
    expect(after.active).toHaveLength(1);
    expect(after.payments).toHaveLength(1);
  });

  // ── Transient failures make Wompi retry ───────────────────────────────

  describe('12. a transient processing error in the webhook → 500 so Wompi retries; the retry books exactly once (guards: webhook answering 200 on transient failures)', () => {
    it('serialization failure (P2034) in the booking transaction', async () => {
      const s = await scenario();
      const tx = wompiCharges(await checkout(s.student, s.booking()));
      const event = wompiEvent(tx);
      sessionRepo.createSessionWithParticipant.mockRejectedValueOnce(writeConflict());

      const failed = await deliverWebhook(event);

      expect(failed).toMatchObject({ status: 500, body: { success: false } });
      await expectNothingBooked(s.tutor.id, tx.reference);

      const retried = await deliverWebhook(event);

      expect(retried).toMatchObject({ status: 200, body: { success: true } });
      await expectBookedOnce({ ...s, tx });
    });

    it('write conflict (P2034) on the payment insert after the session was booked', async () => {
      const s = await scenario();
      const tx = wompiCharges(await checkout(s.student, s.booking()));
      const event = wompiEvent(tx);
      paymentRepo.create.mockRejectedValueOnce(writeConflict());

      const failed = await deliverWebhook(event);

      expect(failed).toMatchObject({ status: 500, body: { success: false } });
      const rolledBack = await bookingState(s.tutor.id, tx.reference);
      expect(rolledBack.active).toHaveLength(0); // the session was canceled, not left orphaned
      expect(rolledBack.payments).toHaveLength(0);
      expect(rolledBack.intent.consumedAt).toBeNull();

      const retried = await deliverWebhook(event);

      expect(retried).toMatchObject({ status: 200, body: { success: true } });
      await expectBookedOnce({ ...s, tx });
    });
  });

  // ── Coupon ────────────────────────────────────────────────────────────

  it('13. coupon: hold RESERVED at create-intent, APPROVED once on payment with the discount recorded; a duplicate delivery does not approve twice (guards: coupon over-use / lost discount)', async () => {
    const s = await scenario();
    const coupon = await createCoupon({ discountType: 'PERCENT', discountValue: 10, absorber: 'CALICO' });
    const discount = PRICE / 10;

    const res = await createIntent(s.student, s.booking({ couponCode: coupon.code }));

    expect(res.status).toBe(200);
    expect(res.body.pricing).toEqual({
      originalAmount: PRICE,
      discountAmount: discount,
      amount: PRICE - discount,
      couponCode: coupon.code,
    });
    const { intent } = res.body;
    expect(intent.amountInCents).toBe((PRICE - discount) * 100);
    const hold = await prisma.couponRedemption.findUnique({ where: { intentReference: intent.reference } });
    expect(hold).toMatchObject({ status: 'RESERVED', couponId: coupon.id, userId: s.student.id, paymentId: null });

    const tx = wompiCharges(intent);
    const event = wompiEvent(tx);
    expect(await deliverWebhook(event)).toMatchObject({ status: 200, body: { success: true } });

    const { session, payment } = await expectBookedOnce({ ...s, tx });
    expect(payment.couponId).toBe(coupon.id);
    expect(Number(payment.originalAmount)).toBe(PRICE);
    expect(Number(payment.discountAmount)).toBe(discount);
    expect(Number(payment.amount)).toBe(PRICE - discount);
    expect(Number(payment.tutorPayoutBase)).toBe(PRICE); // Calico absorbs the discount
    const approved = await prisma.couponRedemption.findUnique({ where: { intentReference: intent.reference } });
    expect(approved).toMatchObject({ id: hold.id, status: 'APPROVED', paymentId: payment.id, sessionId: session.id });
    expect(approved.approvedAt).not.toBeNull();

    expect(await deliverWebhook(event)).toMatchObject({ status: 200, body: { success: true } });

    const redemptions = await prisma.couponRedemption.findMany({ where: { couponId: coupon.id } });
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0]).toMatchObject({ status: 'APPROVED', paymentId: payment.id, approvedAt: approved.approvedAt });
    await expectBookedOnce({ ...s, tx });
    const profile = await prisma.tutorProfile.findUnique({ where: { userId: s.tutor.id } });
    expect(Number(profile.nextPayment)).toBe(PRICE);
  });
});
