/**
 * Payment sweeper on a real Postgres: the selection query (window, consumed
 * and final/human-owned intents skipped, rotation order), the JSONB merge of
 * `metadata.sweep`, the manual-duplicate guard query, and two end-to-end runs
 * through the real route → service → reconcile → booking path. Only Wompi's
 * REST lookups, Google Calendar, Brevo and Vercel's waitUntil are replaced.
 */
import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import * as wompiApi from '@/lib/services/wompi-api.service';
import * as calendar from '@/lib/services/calico-calendar.service';
import * as emailService from '@/lib/services/email.service';
import * as paymentIntentRepo from '@/lib/repositories/payment-intent.repository';
import * as sessionRepo from '@/lib/repositories/session.repository';
import { POST as createIntentRoute } from '@/app/api/payments/create-intent/route';
import { POST as sweepRoute } from '@/app/api/jobs/reconcile-payments/route';
import {
  resetSessionData,
  createUser,
  createCourse,
  createSession,
  createTutorWithAvailability,
  offerCourse,
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
  findTransactionsByReference: jest.fn(),
}));
jest.mock('@/lib/services/calico-calendar.service');
jest.mock('@/lib/services/email.service');

const ADMIN_SECRET = 'int-sweeper-secret';
process.env.ADMIN_SECRET = ADMIN_SECRET;

const MIN = 60_000;
const HOUR = 60 * MIN;
const PRICE = 40000;

/** An unconsumed session intent created at `createdAt` with a frozen pricing snapshot. */
function intentAt(createdAt, { metadata = {}, consumedAt = null, reference = `INT-${randomUUID()}` } = {}) {
  return prisma.paymentIntent.create({
    data: {
      reference,
      createdAt,
      consumedAt,
      metadata: { originalAmount: '40000', discountAmount: '0', tutorPayoutBase: '40000', ...metadata },
    },
  });
}

const sweep = (overrides = {}) => ({
  status: 'PENDING', transactionId: 'tx-1', outcome: 'NOT_APPROVED', reason: null,
  checkedAt: '2026-11-04T10:00:00.000Z', ...overrides,
});

// ─── Wompi ledger behind the mocked lookups ───────────────────────────

const ledger = new Map();

function wompiCharges(reference, amountInCents, status = 'APPROVED') {
  const tx = {
    id: `int-tx-${randomUUID()}`,
    reference,
    amount_in_cents: amountInCents,
    currency: 'COP',
    status,
    payment_method_type: 'PSE',
    created_at: new Date().toISOString(),
    metadata: {},
  };
  ledger.set(tx.id, tx);
  return tx;
}

async function flushBackgroundWork() {
  const pending = jest.requireMock('@vercel/functions').__pending;
  while (pending.length) await Promise.allSettled(pending.splice(0));
}

beforeEach(async () => {
  await resetSessionData();
  ledger.clear();
  wompiApi.fetchTransaction.mockReset().mockImplementation(async (id) => {
    const tx = ledger.get(id);
    if (!tx) throw Object.assign(new Error(`[wompi-api] Transaction ${id} not found`), { code: 'NOT_FOUND' });
    return { ...tx };
  });
  wompiApi.findTransactionsByReference.mockReset().mockImplementation(async (reference) =>
    [...ledger.values()].filter((tx) => tx.reference === reference).map((tx) => ({ ...tx })),
  );
  calendar.createTutoringSessionEvent
    .mockReset()
    .mockImplementation(async () => ({ success: true, eventId: `int-evt-${randomUUID()}`, meetLink: 'https://meet.google.com/int' }));
  emailService.sendSessionConfirmedEmail.mockReset().mockResolvedValue({ success: true });
});
afterEach(flushBackgroundWork);
afterAll(() => prisma.$disconnect());

describe('findUnconsumedForSweep (real Postgres)', () => {
  const now = new Date();
  const window = {
    createdFrom: new Date(now.getTime() - 48 * HOUR),
    createdTo: new Date(now.getTime() - 10 * MIN),
    skipStatuses: ['DECLINED', 'VOIDED', 'ERROR'],
    skipOutcomes: ['NEEDS_ATTENTION'],
    limit: 40,
  };
  const refsOf = (rows) => rows.map((r) => r.reference);

  it('keeps only unconsumed intents inside [now − 48 h, now − 10 min], bounds included', async () => {
    const tooOld = await intentAt(new Date(now.getTime() - 48 * HOUR - 1000));
    const oldestIn = await intentAt(window.createdFrom);
    const middle = await intentAt(new Date(now.getTime() - 5 * HOUR));
    const newestIn = await intentAt(window.createdTo);
    const tooYoung = await intentAt(new Date(now.getTime() - 9 * MIN));
    const consumed = await intentAt(new Date(now.getTime() - 3 * HOUR), { consumedAt: new Date() });

    const rows = await paymentIntentRepo.findUnconsumedForSweep(window);

    expect(refsOf(rows)).toEqual([oldestIn.reference, middle.reference, newestIn.reference]);
    expect(refsOf(rows)).not.toEqual(expect.arrayContaining([tooOld.reference, tooYoung.reference, consumed.reference]));
    expect(rows[1]).toMatchObject({ kind: 'session', metadata: expect.objectContaining({ originalAmount: '40000' }) });
    expect(rows[1].createdAt).toEqual(middle.createdAt);
  });

  it('skips intents whose last sweep is a final Wompi status or a human-owned NEEDS_ATTENTION', async () => {
    const at = new Date(now.getTime() - 2 * HOUR);
    const pending = await intentAt(at, { metadata: { sweep: sweep({ status: 'PENDING' }) } });
    const noTx = await intentAt(at, { metadata: { sweep: sweep({ status: 'NO_TRANSACTION', transactionId: null, outcome: 'NO_TRANSACTION' }) } });
    const failed = await intentAt(at, { metadata: { sweep: sweep({ status: null, transactionId: null, outcome: 'ERROR', reason: 'PROVIDER_UNAVAILABLE' }) } });
    await intentAt(at, { metadata: { sweep: sweep({ status: 'DECLINED' }) } });
    await intentAt(at, { metadata: { sweep: sweep({ status: 'VOIDED' }) } });
    await intentAt(at, { metadata: { sweep: sweep({ status: 'ERROR' }) } });
    await intentAt(at, { metadata: { sweep: sweep({ status: 'APPROVED', outcome: 'NEEDS_ATTENTION', reason: 'SLOT_PASSED' }) } });

    const rows = await paymentIntentRepo.findUnconsumedForSweep(window);

    expect(refsOf(rows).sort()).toEqual([pending.reference, noTx.reference, failed.reference].sort());
  });

  it('rotates: never-swept intents first (oldest first), then the least recently checked, capped by limit', async () => {
    const checkedLate = await intentAt(new Date(now.getTime() - 40 * HOUR), {
      metadata: { sweep: sweep({ checkedAt: '2026-11-04T10:20:00.000Z' }) },
    });
    const checkedEarly = await intentAt(new Date(now.getTime() - 30 * HOUR), {
      metadata: { sweep: sweep({ checkedAt: '2026-11-04T10:10:00.000Z' }) },
    });
    const freshOld = await intentAt(new Date(now.getTime() - 20 * HOUR));
    const freshNew = await intentAt(new Date(now.getTime() - 1 * HOUR));

    expect(refsOf(await paymentIntentRepo.findUnconsumedForSweep(window))).toEqual([
      freshOld.reference, freshNew.reference, checkedEarly.reference, checkedLate.reference,
    ]);
    expect(refsOf(await paymentIntentRepo.findUnconsumedForSweep({ ...window, limit: 2 }))).toEqual([
      freshOld.reference, freshNew.reference,
    ]);
  });
});

describe('recordSweepResult (real Postgres)', () => {
  it('merges metadata.sweep, keeping every other key, and replaces the previous sweep', async () => {
    const intent = await intentAt(new Date(Date.now() - HOUR), {
      metadata: { pendingTransactionId: 'tx-pinned', startTimestamp: '2026-11-06T15:00:00.000Z', sweep: sweep() },
    });
    const result = sweep({ status: 'APPROVED', outcome: 'NEEDS_ATTENTION', reason: 'SLOT_PASSED', checkedAt: '2026-11-04T11:00:00.000Z' });

    await paymentIntentRepo.recordSweepResult(intent.reference, result);

    const stored = await prisma.paymentIntent.findUnique({ where: { reference: intent.reference } });
    expect(stored.metadata).toEqual({
      originalAmount: '40000',
      discountAmount: '0',
      tutorPayoutBase: '40000',
      pendingTransactionId: 'tx-pinned',
      startTimestamp: '2026-11-06T15:00:00.000Z',
      sweep: result,
    });
  });

  it('also writes a consumed intent (the sweep that booked it is still recorded)', async () => {
    const intent = await intentAt(new Date(Date.now() - HOUR), { consumedAt: new Date() });
    await paymentIntentRepo.recordSweepResult(intent.reference, sweep({ status: 'APPROVED', outcome: 'FULFILLED' }));
    const stored = await prisma.paymentIntent.findUnique({ where: { reference: intent.reference } });
    expect(stored.metadata.sweep).toMatchObject({ outcome: 'FULFILLED' });
    expect(stored.metadata.originalAmount).toBe('40000');
  });
});

describe('findActiveSessionCreatedAfter — manual duplicate guard (real Postgres)', () => {
  async function pair() {
    const tutor = await createUser({ isTutorApproved: true });
    const student = await createUser();
    const course = await createCourse();
    return { tutor, student, course };
  }
  const query = ({ tutor, student, course }, createdAfter, reference = 'TXN-guard') =>
    sessionRepo.findActiveSessionCreatedAfter({
      studentId: student.id, tutorId: tutor.id, courseId: course.id, createdAfter, excludeIntentReference: reference,
    });

  it('finds a live session of the same student, tutor and course created after the intent', async () => {
    const p = await pair();
    const intentCreatedAt = new Date(Date.now() - HOUR);
    const manual = await createSession({ ...p, start: new Date(Date.now() + 24 * HOUR) });
    await prisma.session.update({ where: { id: manual.id }, data: { source: 'ManualAdmin', notes: null } });

    await expect(query(p, intentCreatedAt)).resolves.toMatchObject({ id: manual.id, source: 'ManualAdmin' });

    // Notes with other text are not the intent's own stamp either.
    await prisma.session.update({ where: { id: manual.id }, data: { notes: 'Pago PSE recuperado a mano' } });
    await expect(query(p, intentCreatedAt)).resolves.toMatchObject({ id: manual.id });
  });

  it('ignores the intent’s own session, canceled/rejected ones, older ones and other pairs', async () => {
    const p = await pair();
    const start = new Date(Date.now() + 24 * HOUR);
    const intentCreatedAt = new Date(Date.now() - HOUR);

    const own = await createSession({ ...p, start });
    await prisma.session.update({ where: { id: own.id }, data: { notes: 'Booked via payment intent TXN-guard' } });
    await createSession({ ...p, start: new Date(start.getTime() + 2 * HOUR), status: 'Canceled' });
    await createSession({ ...p, start: new Date(start.getTime() + 4 * HOUR), status: 'Rejected' });
    const older = await createSession({ ...p, start: new Date(start.getTime() + 6 * HOUR) });
    await prisma.session.update({ where: { id: older.id }, data: { createdAt: new Date(Date.now() - 2 * HOUR) } });
    const other = await pair();
    await createSession({ tutor: p.tutor, student: other.student, course: p.course, start: new Date(start.getTime() + 8 * HOUR) });
    await createSession({ tutor: p.tutor, student: p.student, course: other.course, start: new Date(start.getTime() + 10 * HOUR) });
    await createSession({ tutor: other.tutor, student: p.student, course: p.course, start: new Date(start.getTime() + 12 * HOUR) });

    await expect(query(p, intentCreatedAt)).resolves.toBeNull();
  });
});

describe('sweeper end to end: POST /api/jobs/reconcile-payments (real Postgres)', () => {
  async function scenario() {
    const tutor = await createTutorWithAvailability();
    const course = await createCourse({ basePrice: PRICE });
    await offerCourse(tutor, course);
    const student = await createUser({ name: 'Int Student' });
    return { tutor, course, student };
  }

  /** A real create-intent, then backdated 30 min: the PSE webhook never arrived. */
  async function lostPseCheckout({ tutor, course, student }) {
    const res = await createIntentRoute(new Request('http://localhost/api/payments/create-intent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: bearer(student) },
      body: JSON.stringify({ tutorId: tutor.id, courseId: course.id, ...slotAt(), topicsToReview: 'Integrales' }),
    }));
    expect(res.status).toBe(200);
    const { intent } = await res.json();
    await prisma.paymentIntent.update({
      where: { reference: intent.reference },
      data: { createdAt: new Date(Date.now() - 30 * MIN) },
    });
    return intent;
  }

  const runSweep = async () => {
    const res = await sweepRoute(new Request('http://localhost/api/jobs/reconcile-payments', {
      method: 'POST',
      headers: { 'x-admin-secret': ADMIN_SECRET },
    }));
    return { status: res.status, body: await res.json() };
  };

  it('books an approved PSE payment nobody confirmed, records FULFILLED on the consumed intent, and leaves it alone afterwards', async () => {
    const s = await scenario();
    const intent = await lostPseCheckout(s);
    const tx = wompiCharges(intent.reference, intent.amountInCents);

    const first = await runSweep();

    expect(first).toMatchObject({
      status: 200,
      body: {
        success: true,
        checked: 1,
        counts: expect.objectContaining({ FULFILLED: 1 }),
        items: [{ reference: intent.reference, kind: 'session', outcome: 'FULFILLED', reason: null }],
      },
    });
    const sessions = await prisma.session.findMany({ where: { tutorId: s.tutor.id }, include: { participants: true } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ notes: `Booked via payment intent ${intent.reference}` });
    expect(sessions[0].participants.map((p) => p.studentId)).toEqual([s.student.id]);
    expect(await prisma.payment.findMany({ where: { wompiId: tx.id } })).toHaveLength(1);
    const stored = await prisma.paymentIntent.findUnique({ where: { reference: intent.reference } });
    expect(stored.consumedAt).not.toBeNull();
    expect(stored.metadata).toMatchObject({
      originalAmount: String(PRICE),
      studentId: s.student.id,
      sweep: { status: 'APPROVED', transactionId: tx.id, outcome: 'FULFILLED', reason: null, checkedAt: expect.any(String) },
    });

    const second = await runSweep();
    expect(second.body).toMatchObject({ checked: 0, items: [] });
    expect(await prisma.session.count({ where: { tutorId: s.tutor.id } })).toBe(1);
  });

  it('a session the team already created by hand → NEEDS_ATTENTION, nothing booked, and the intent is not picked again', async () => {
    const s = await scenario();
    const intent = await lostPseCheckout(s);
    wompiCharges(intent.reference, intent.amountInCents);
    const manual = await createSession({ ...s, start: new Date(Date.now() + 24 * HOUR) });
    await prisma.session.update({ where: { id: manual.id }, data: { source: 'ManualAdmin', notes: null } });

    const first = await runSweep();

    expect(first.body).toMatchObject({
      checked: 1,
      items: [{ reference: intent.reference, kind: 'session', outcome: 'NEEDS_ATTENTION', reason: 'POSSIBLE_MANUAL_DUPLICATE' }],
    });
    expect(await prisma.session.count({ where: { tutorId: s.tutor.id } })).toBe(1);
    expect(await prisma.payment.count()).toBe(0);
    const stored = await prisma.paymentIntent.findUnique({ where: { reference: intent.reference } });
    expect(stored.consumedAt).toBeNull();
    expect(stored.metadata.sweep).toMatchObject({ status: 'APPROVED', outcome: 'NEEDS_ATTENTION', reason: 'POSSIBLE_MANUAL_DUPLICATE' });

    const second = await runSweep();
    expect(second.body).toMatchObject({ checked: 0, items: [] });
    expect(wompiApi.findTransactionsByReference).toHaveBeenCalledTimes(1);
  });
});
