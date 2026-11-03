/**
 * What a tutor is owed, against a real Postgres: the rule is a Prisma `where`
 * (and a raw SQL twin), which tests with mocked repositories cannot check.
 * Until 2026-11 only `Completed` sessions counted, and no screen ever marks one.
 */
import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import { createSessionWithParticipant } from '@/lib/repositories/session.repository';
import { create as createPayment } from '@/lib/repositories/payment.repository';
import { aggregatePendingByTutor, findPayments, markPayoutAsPaid, markPayoutsAsPaid } from '@/lib/repositories/payouts.repository';
import { financialStats } from '@/lib/repositories/admin-users.repository';
import { tutorPayoutStateOf } from '@/lib/payments/tutor-payout-state';
import { createCourse, createUser } from './helpers/factory';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

let slot = 0;

/** A paid session by default, ended a day ago, on its own hour for that tutor. */
async function createPaidSession({
  tutor,
  course,
  student,
  status = 'Accepted',
  source = 'Platform',
  endsIn = -DAY,
  payment = {},
}) {
  slot += 2;
  const end = new Date(Date.now() + endsIn + slot * HOUR * (endsIn < 0 ? -1 : 1));
  const session = await createSessionWithParticipant(
    {
      courseId: course.id,
      tutorId: tutor.id,
      sessionType: 'Individual',
      maxCapacity: 1,
      startTimestamp: new Date(end.getTime() - HOUR),
      endTimestamp: end,
      status,
      locationType: 'Virtual',
      source,
    },
    student.id,
    0,
  );
  const row = await createPayment({
    sessionId: session.id,
    studentId: student.id,
    tutorId: tutor.id,
    amount: 50000,
    status: 'paid',
    wompiId: source === 'ManualAdmin' ? null : `tx-${session.id}`,
    ...payment,
  });
  return { session, payment: row };
}

async function setup() {
  const [tutor, student, course] = await Promise.all([
    createUser({ isTutorApproved: true }),
    createUser(),
    createCourse(),
  ]);
  return { tutor, student, course };
}

const pendingIds = async (tutorId, opts = {}) => {
  const { items } = await findPayments({ payout: 'pending', limit: 100, ...opts });
  return items.filter((p) => p.tutor.id === tutorId).map((p) => p.id);
};

afterAll(async () => {
  await prisma.$disconnect();
});

describe('what a tutor is owed', () => {
  it('counts a paid session that already ended, even if nobody marked it Completed', async () => {
    const ctx = await setup();
    const { payment } = await createPaidSession(ctx);

    expect(await pendingIds(ctx.tutor.id)).toEqual([payment.id]);
  });

  it('counts a Completed session', async () => {
    const ctx = await setup();
    const { payment } = await createPaidSession({ ...ctx, status: 'Completed' });

    expect(await pendingIds(ctx.tutor.id)).toEqual([payment.id]);
  });

  it('does not count a session still to come', async () => {
    const ctx = await setup();
    await createPaidSession({ ...ctx, endsIn: 3 * DAY });

    expect(await pendingIds(ctx.tutor.id)).toEqual([]);
  });

  it.each(['Canceled', 'Rejected', 'Pending'])('does not count a %s session', async (status) => {
    const ctx = await setup();
    await createPaidSession({ ...ctx, status });

    expect(await pendingIds(ctx.tutor.id)).toEqual([]);
  });

  it('does not count a manual session still waiting for its proof', async () => {
    const ctx = await setup();
    await createPaidSession({ ...ctx, source: 'ManualAdmin', payment: { status: 'pending' } });

    expect(await pendingIds(ctx.tutor.id)).toEqual([]);
  });

  it('leaves out test courses, as in every money view', async () => {
    const { tutor, student } = await setup();
    const testCourse = await prisma.course.upsert({
      where: { code: 'TEST123' },
      update: {},
      create: { name: 'Test', code: 'TEST123', basePrice: 1000, complexity: 'Foundational', careerId: (await createCourse()).careerId },
    });
    await createPaidSession({ tutor, student, course: testCourse });

    expect(await pendingIds(tutor.id)).toEqual([]);
  });

  it('gives the same pending amount in the tutor digest and in the raw SQL of the user detail', async () => {
    const ctx = await setup();
    await createPaidSession(ctx);
    await createPaidSession({ ...ctx, status: 'Completed' });
    await createPaidSession({ ...ctx, endsIn: 3 * DAY });
    await createPaidSession({ ...ctx, status: 'Canceled' });

    const groups = await aggregatePendingByTutor();
    const digest = groups.find((g) => g.tutor.id === ctx.tutor.id);
    const stats = await financialStats(ctx.tutor.id);

    expect(digest.totalTutorBase).toBe(100000);
    expect(stats.earnedGrossPending).toBe(100000);
  });
});

describe('the tutoring dates of each tutor', () => {
  it('lists every session owed with its date and course, oldest first', async () => {
    const ctx = await setup();
    const recent = await createPaidSession(ctx);
    const old = await createPaidSession({ ...ctx, endsIn: -5 * DAY });
    await createPaidSession({ ...ctx, endsIn: 3 * DAY });

    const digest = (await aggregatePendingByTutor()).find((g) => g.tutor.id === ctx.tutor.id);

    expect(digest.sessions.map((s) => s.paymentId)).toEqual([old.payment.id, recent.payment.id]);
    expect(digest.sessions[0].startTimestamp).toEqual(old.session.startTimestamp);
    expect(digest.sessions[0].course).toEqual({ code: ctx.course.code, name: ctx.course.name });
  });
});

describe('how the student paid', () => {
  it('counts each type per tutor and only real charges towards the Wompi fee', async () => {
    const ctx = await setup();
    await createPaidSession(ctx);
    await createPaidSession({ ...ctx, source: 'ManualAdmin' });
    await createPaidSession({
      ...ctx,
      payment: { amount: 0, originalAmount: 50000, discountAmount: 50000, tutorPayoutBase: 50000, wompiId: null },
    });

    const digest = (await aggregatePendingByTutor()).find((g) => g.tutor.id === ctx.tutor.id);

    expect(digest.typeCounts).toEqual({ wompi: 1, manual: 1, courtesy: 1 });
    expect(digest.wompiCount).toBe(1);
    expect(digest.wompiGross).toBe(50000);
    expect(digest.totalTutorBase).toBe(150000);
  });

  it('filters the detail by type', async () => {
    const ctx = await setup();
    const wompi = await createPaidSession(ctx);
    const manual = await createPaidSession({ ...ctx, source: 'ManualAdmin' });

    expect(await pendingIds(ctx.tutor.id, { type: 'wompi' })).toEqual([wompi.payment.id]);
    expect(await pendingIds(ctx.tutor.id, { type: 'manual' })).toEqual([manual.payment.id]);
    expect((await pendingIds(ctx.tutor.id, { type: 'all' })).sort()).toEqual([wompi.payment.id, manual.payment.id].sort());
  });
});

describe('marking the tutor as paid', () => {
  const NOTE = { adminId: null, note: 'Nequi 123' };

  it('moves it from owed to paid, with date and note', async () => {
    const ctx = await setup();
    const { payment } = await createPaidSession(ctx);

    const { count } = await markPayoutsAsPaid([payment.id], NOTE);

    expect(count).toBe(1);
    expect(await pendingIds(ctx.tutor.id)).toEqual([]);
    const { items } = await findPayments({ payout: 'paid', limit: 100 });
    const paid = items.find((p) => p.id === payment.id);
    expect(paid.tutorPayoutStatus).toBe('paid');
    expect(paid.tutorPayoutAt).toBeInstanceOf(Date);
    expect(paid.tutorPayoutNote).toBe('Nequi 123');
  });

  it('shows both states under `all`', async () => {
    const ctx = await setup();
    const paid = await createPaidSession(ctx);
    const owed = await createPaidSession(ctx);
    await markPayoutsAsPaid([paid.payment.id], NOTE);

    const { items } = await findPayments({ payout: 'all', limit: 100 });
    const mine = Object.fromEntries(items.filter((p) => p.tutor.id === ctx.tutor.id).map((p) => [p.id, p.tutorPayoutStatus]));

    expect(mine).toEqual({ [paid.payment.id]: 'paid', [owed.payment.id]: 'pending' });
  });

  it('does not rewrite the date of an earlier transfer', async () => {
    const ctx = await setup();
    const { payment } = await createPaidSession(ctx);
    await markPayoutsAsPaid([payment.id], NOTE);
    const first = await prisma.payment.findUnique({ where: { id: payment.id } });

    const { count } = await markPayoutsAsPaid([payment.id], { adminId: null, note: 'otra' });

    const second = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(count).toBe(0);
    expect(second.tutorPayoutAt).toEqual(first.tutorPayoutAt);
    expect(second.tutorPayoutNote).toBe('Nequi 123');
  });

  it('refuses a payment the student has not paid', async () => {
    const ctx = await setup();
    const { payment } = await createPaidSession({ ...ctx, source: 'ManualAdmin', payment: { status: 'pending' } });

    const { count } = await markPayoutsAsPaid([payment.id], NOTE);

    expect(count).toBe(0);
    expect((await prisma.payment.findUnique({ where: { id: payment.id } })).tutorPayoutStatus).toBe('pending');
  });
});

describe('the tutor pending balance (next_payment)', () => {
  const NOTE = { adminId: null, note: 'Nequi 123' };
  const balance = async (tutorId) => Number((await prisma.tutorProfile.findUnique({ where: { userId: tutorId } })).nextPayment);
  const setBalance = (tutorId, nextPayment) => prisma.tutorProfile.update({ where: { userId: tutorId }, data: { nextPayment } });

  it('goes down by what was transferred, per tutor', async () => {
    const a = await setup();
    const b = await setup();
    const first = await createPaidSession(a);
    const second = await createPaidSession(a);
    const other = await createPaidSession(b);
    await setBalance(a.tutor.id, 150000);
    await setBalance(b.tutor.id, 50000);

    const { count } = await markPayoutsAsPaid([first.payment.id, second.payment.id, other.payment.id], NOTE);

    expect(count).toBe(3);
    expect(await balance(a.tutor.id)).toBe(50000);
    expect(await balance(b.tutor.id)).toBe(0);
  });

  it('goes down once when marks race', async () => {
    const ctx = await setup();
    const { payment } = await createPaidSession(ctx);
    await setBalance(ctx.tutor.id, 120000);

    const results = await Promise.all(Array.from({ length: 6 }, () => markPayoutsAsPaid([payment.id], NOTE)));

    expect(results.reduce((sum, r) => sum + r.count, 0)).toBe(1);
    expect(await balance(ctx.tutor.id)).toBe(70000);
  });

  it('does not move for what could not be marked', async () => {
    const ctx = await setup();
    const { payment } = await createPaidSession({ ...ctx, source: 'ManualAdmin', payment: { status: 'pending' } });
    await setBalance(ctx.tutor.id, 75000);

    await markPayoutsAsPaid([payment.id], NOTE);

    expect(await balance(ctx.tutor.id)).toBe(75000);
  });

  it('never goes below zero', async () => {
    const ctx = await setup();
    const { payment } = await createPaidSession(ctx);
    await setBalance(ctx.tutor.id, 10000);

    await markPayoutsAsPaid([payment.id], NOTE);

    expect(await balance(ctx.tutor.id)).toBe(0);
  });

  it('marking one by one follows the same rule and repeats harmlessly', async () => {
    const ctx = await setup();
    const { payment } = await createPaidSession(ctx);
    await setBalance(ctx.tutor.id, 50000);

    const first = await markPayoutAsPaid(payment.id, NOTE);
    const again = await markPayoutAsPaid(payment.id, { adminId: null, note: 'otra' });

    expect(first.tutorPayoutStatus).toBe('paid');
    expect(again.tutorPayoutNote).toBe('Nequi 123');
    expect(await balance(ctx.tutor.id)).toBe(0);
    expect(await markPayoutAsPaid(randomUUID(), NOTE)).toBeNull();
  });
});

describe('what the admin and the tutor see', () => {
  it('agree on what is owed, session by session', async () => {
    const ctx = await setup();
    const cases = [];
    for (const overrides of [
      {},
      { status: 'Completed' },
      { endsIn: 3 * DAY },
      { status: 'Canceled' },
      { status: 'Rejected' },
      { status: 'Pending' },
      { source: 'ManualAdmin', payment: { status: 'pending' } },
    ]) {
      cases.push(await createPaidSession({ ...ctx, ...overrides }));
    }
    const marked = await createPaidSession(ctx);
    await markPayoutsAsPaid([marked.payment.id], { adminId: null, note: null });

    const adminOwed = new Set(await pendingIds(ctx.tutor.id));
    const rows = await prisma.payment.findMany({
      where: { id: { in: [...cases, marked].map((c) => c.payment.id) } },
      include: { session: { select: { status: true, endTimestamp: true, course: { select: { code: true } } } } },
    });
    const tutorOwed = rows.filter((p) => tutorPayoutStateOf(p) === 'owed').map((p) => p.id);

    expect(new Set(tutorOwed)).toEqual(adminOwed);
    expect(adminOwed.size).toBe(2);
    expect(rows.filter((p) => tutorPayoutStateOf(p) === 'paid').map((p) => p.id)).toEqual([marked.payment.id]);
  });

  it('the user detail shows what was already paid out', async () => {
    const ctx = await setup();
    const paid = await createPaidSession(ctx);
    await createPaidSession(ctx);
    await markPayoutsAsPaid([paid.payment.id], { adminId: null, note: null });

    const stats = await financialStats(ctx.tutor.id);

    expect(stats.earnedGrossPaidOut).toBe(50000);
    expect(stats.earnedGrossPending).toBe(50000);
  });
});
