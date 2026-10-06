/**
 * Spec §10.3 cases 1–7: the event row lock, the early-bird count and the
 * wompiId idempotency barrier, exercised by the real services against a
 * real Postgres. Parallel calls go through Promise.all on one pg Pool
 * (PG_POOL_MAX=12), so the transactions genuinely contend for the lock.
 */
import prisma from '@/lib/prisma';
import {
  startCheckout,
  registerFree,
  fulfilPaidRegistration,
  cancelRegistration,
} from '@/lib/services/event-checkout.service';
import { cancelEvent } from '@/lib/services/event-admin.service';
import { resetEventData, createUser, createEvent, approvedTx, storedIntent } from './helpers/factory';

const LIST_CENTS = 2_000_000; // 20000 COP
const EARLY_CENTS = 1_800_000; // 20000 − 10 %

const createUsers = (n) => Promise.all(Array.from({ length: n }, () => createUser()));

const registrationOf = (eventId, userId) =>
  prisma.eventRegistration.findUnique({ where: { eventId_userId: { eventId, userId } } });

async function checkoutAndPay(slug, user) {
  const checkout = await startCheckout({ slug, userId: user.id });
  const outcome = await fulfilPaidRegistration(approvedTx(checkout), await storedIntent(checkout.reference));
  return { checkout, outcome };
}

beforeEach(resetEventData);
afterAll(() => prisma.$disconnect());

describe('event checkout concurrency (real Postgres)', () => {
  it('1. 20 parallel checkouts on 5 early-bird slots discount exactly 5', async () => {
    const { event } = await createEvent();
    const users = await createUsers(20);

    const results = await Promise.all(users.map((u) => startCheckout({ slug: event.slug, userId: u.id })));

    const discounted = results.filter((r) => r.quote.earlyBird);
    expect(discounted).toHaveLength(5);
    discounted.forEach((r) => expect(r.amountInCents).toBe(EARLY_CENTS));
    results.filter((r) => !r.quote.earlyBird).forEach((r) => expect(r.amountInCents).toBe(LIST_CENTS));

    expect(await prisma.eventRegistration.count({ where: { eventId: event.id, earlyBird: true } })).toBe(5);
    expect(await prisma.eventRegistration.count({ where: { eventId: event.id, status: 'PendingPayment' } })).toBe(20);
    expect(await prisma.paymentIntent.count({ where: { kind: 'event' } })).toBe(20);
  });

  it('2. webhook and confirm-payment fulfilling the same transaction → 1 payment, Confirmed once', async () => {
    const { event } = await createEvent();
    const user = await createUser();
    const checkout = await startCheckout({ slug: event.slug, userId: user.id });
    const tx = approvedTx(checkout);
    const stored = await storedIntent(checkout.reference);

    const results = await Promise.all([fulfilPaidRegistration(tx, stored), fulfilPaidRegistration(tx, stored)]);

    expect(results.filter((r) => !r.alreadyProcessed)).toHaveLength(1);
    expect(results.filter((r) => r.alreadyProcessed)).toHaveLength(1);
    const registration = await registrationOf(event.id, user.id);
    expect(registration.status).toBe('Confirmed');
    const payments = await prisma.eventPayment.findMany({ where: { registrationId: registration.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ wompiId: tx.id, flag: null, refundStatus: 'None' });
    expect((await storedIntent(checkout.reference)).consumedAt).not.toBeNull();
  });

  it('3. two tabs paid (two approved transactions, one registration) → second flagged DUPLICATE, refund Pending', async () => {
    const { event } = await createEvent();
    const user = await createUser();
    const checkoutA = await startCheckout({ slug: event.slug, userId: user.id });
    const checkoutB = await startCheckout({ slug: event.slug, userId: user.id }); // overwrites A's hold
    const storedA = await storedIntent(checkoutA.reference);
    const storedB = await storedIntent(checkoutB.reference);

    const outcomes = await Promise.all([
      fulfilPaidRegistration(approvedTx(checkoutB), storedB),
      fulfilPaidRegistration(approvedTx(checkoutA), storedA),
    ]);

    expect(outcomes.filter((o) => o.newlyConfirmed)).toHaveLength(1);
    const registration = await registrationOf(event.id, user.id);
    expect(registration.status).toBe('Confirmed');
    const payments = await prisma.eventPayment.findMany({ where: { registrationId: registration.id } });
    expect(payments).toHaveLength(2);
    const duplicate = payments.filter((p) => p.flag === 'DUPLICATE');
    expect(duplicate).toHaveLength(1);
    expect(duplicate[0].refundStatus).toBe('Pending');
    const kept = payments.find((p) => p.flag === null);
    expect(kept.refundStatus).toBe('None');
    expect(registration.intentReference).toBe(kept.reference);
  });

  describe('4. admin cancels the event while a payment is being fulfilled', () => {
    async function setup() {
      const { event } = await createEvent();
      const admin = await createUser({ role: 'ADMIN', name: 'Int Admin' });
      const user = await createUser();
      const checkout = await startCheckout({ slug: event.slug, userId: user.id });
      const stored = await storedIntent(checkout.reference);
      const cancel = () => cancelEvent({ adminId: admin.id, id: event.id, reason: 'x' });
      const fulfil = () => fulfilPaidRegistration(approvedTx(checkout), stored);
      return { event, user, cancel, fulfil };
    }

    async function expectCanceledWithPendingRefund(event, user) {
      expect((await prisma.event.findUnique({ where: { id: event.id } })).status).toBe('Canceled');
      const registration = await registrationOf(event.id, user.id);
      expect(registration).toMatchObject({ status: 'Canceled', canceledBy: 'admin' });
      const payments = await prisma.eventPayment.findMany({ where: { registrationId: registration.id } });
      expect(payments).toHaveLength(1);
      expect(payments[0].refundStatus).toBe('Pending');
      return payments[0];
    }

    it('in parallel: registration Canceled, payment refund Pending in whichever order they serialise', async () => {
      const { event, user, cancel, fulfil } = await setup();

      const [, outcome] = await Promise.all([cancel(), fulfil()]);

      const payment = await expectCanceledWithPendingRefund(event, user);
      if (outcome.newlyConfirmed) {
        expect(payment.flag).toBeNull(); // fulfil committed first; the cancel moved None → Pending
      } else {
        expect(payment.flag).toBe('EVENT_CANCELED'); // cancel committed first
      }
    });

    it('cancel commits first → payment flagged EVENT_CANCELED', async () => {
      const { event, user, cancel, fulfil } = await setup();
      await cancel();
      const outcome = await fulfil();
      expect(outcome).toMatchObject({ flag: 'EVENT_CANCELED', newlyConfirmed: false });
      expect((await expectCanceledWithPendingRefund(event, user)).flag).toBe('EVENT_CANCELED');
    });

    it('fulfil commits first → the cancel moves the payment None → Pending', async () => {
      const { event, user, cancel, fulfil } = await setup();
      const outcome = await fulfil();
      expect(outcome).toMatchObject({ flag: null, newlyConfirmed: true });
      await cancel();
      expect((await expectCanceledWithPendingRefund(event, user)).flag).toBeNull();
    });
  });

  it('5. expired early-bird hold, slots taken meanwhile, payment arrives → Confirmed at the paid price, EARLY_BIRD_OVERRUN', async () => {
    const { event } = await createEvent();
    const a = await createUser();
    const checkoutA = await startCheckout({ slug: event.slug, userId: a.id });
    expect(checkoutA.quote.earlyBird).toBe(true);
    await prisma.eventRegistration.update({
      where: { eventId_userId: { eventId: event.id, userId: a.id } },
      data: { reservedAt: new Date(Date.now() - 31 * 60_000) },
    });

    const others = await createUsers(5);
    const otherCheckouts = await Promise.all(others.map((u) => startCheckout({ slug: event.slug, userId: u.id })));
    expect(otherCheckouts.every((c) => c.quote.earlyBird)).toBe(true);

    const outcome = await fulfilPaidRegistration(approvedTx(checkoutA), await storedIntent(checkoutA.reference));

    expect(outcome).toMatchObject({ flag: 'EARLY_BIRD_OVERRUN', newlyConfirmed: true });
    const registration = await registrationOf(event.id, a.id);
    expect(registration.status).toBe('Confirmed');
    expect(registration.earlyBird).toBe(true);
    expect(Number(registration.finalAmount)).toBe(18000);
    const [payment] = await prisma.eventPayment.findMany({ where: { registrationId: registration.id } });
    expect(payment.flag).toBe('EARLY_BIRD_OVERRUN');
    expect(payment.refundStatus).toBe('None');
    expect(Number(payment.amount)).toBe(18000);
  });

  it('6. 50 parallel free registrations by the same user → 1 row, every call resolves', async () => {
    const { event } = await createEvent({ price: 0, earlyBirdSlots: null, earlyBirdPercent: null });
    const user = await createUser();

    const settled = await Promise.allSettled(
      Array.from({ length: 50 }, () => registerFree({ slug: event.slug, userId: user.id })),
    );

    expect(settled.filter((s) => s.status === 'rejected').map((s) => s.reason?.message)).toEqual([]);
    expect(new Set(settled.map((s) => s.value.id)).size).toBe(1);
    const rows = await prisma.eventRegistration.findMany({ where: { eventId: event.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: user.id, status: 'Confirmed' });
    expect(Number(rows[0].finalAmount)).toBe(0);
  });

  it('7. a cancelled early-bird registration frees its slot for the next checkout', async () => {
    const { event } = await createEvent();
    const early = await createUsers(5);
    const paid = await Promise.all(early.map((u) => checkoutAndPay(event.slug, u)));
    paid.forEach(({ checkout, outcome }) => {
      expect(checkout.quote.earlyBird).toBe(true);
      expect(outcome).toMatchObject({ flag: null, newlyConfirmed: true });
    });

    const late = await createUser();
    const beforeCancel = await startCheckout({ slug: event.slug, userId: late.id });
    expect(beforeCancel.quote.earlyBird).toBe(false); // all 5 slots taken

    const { registration, refundable } = await cancelRegistration({
      slug: event.slug,
      userId: early[0].id,
      refundMethod: 'nequi',
      refundMethodDetails: '3001234567',
      now: new Date(),
    });
    expect(refundable).toBe(true);
    expect(registration.status).toBe('Canceled');
    const [refund] = await prisma.eventPayment.findMany({ where: { registrationId: registration.id } });
    expect(refund.refundStatus).toBe('Pending');

    const afterCancel = await startCheckout({ slug: event.slug, userId: late.id });
    expect(afterCancel.quote.earlyBird).toBe(true);
    expect(afterCancel.amountInCents).toBe(EARLY_CENTS);
  });
});
