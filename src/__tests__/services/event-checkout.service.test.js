/**
 * @jest-environment node
 *
 * Unit tests for src/lib/services/event-checkout.service.js: free
 * registration, paid checkout with early-bird holds, Wompi fulfilment and
 * user cancellation (spec §5.3–§5.7). Prisma, repositories, Wompi, email and
 * Sentry are mocked; event-pricing is REAL. Every case asserts the exact
 * repository / transaction calls, because the locks and their order are the
 * concurrency guarantee.
 */

const mockTx = {
  eventRegistration: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  eventPayment: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  paymentIntent: { update: jest.fn() },
  user: { updateMany: jest.fn() },
};
const mockScope = { setTag: jest.fn(), setLevel: jest.fn(), setContext: jest.fn() };

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { $transaction: jest.fn((fn) => fn(mockTx)) },
}));
jest.mock('@/lib/repositories/payment-intent.repository', () => ({ create: jest.fn() }));
jest.mock('@/lib/repositories/event-registration.repository', () => ({
  lockEvent: jest.fn(),
  findRegistration: jest.fn(),
  lockRegistration: jest.fn(),
  countEarlyBirdUsage: jest.fn(),
  findPaymentByWompiId: jest.fn(),
}));
jest.mock('@/lib/repositories/event.repository', () => ({
  findBySlug: jest.fn(),
  findById: jest.fn(),
}));
jest.mock('@/lib/repositories/user.repository', () => ({ findById: jest.fn() }));
jest.mock('@/lib/services/wompi.service', () => ({
  generateEventReference: jest.fn(),
  signWidgetIntent: jest.fn(),
}));
jest.mock('@/lib/services/event-email.service', () => ({ sendRegistrationConfirmed: jest.fn() }));
jest.mock('@sentry/nextjs', () => ({
  captureMessage: jest.fn(),
  captureException: jest.fn(),
  withScope: jest.fn((fn) => fn(mockScope)),
}));
jest.mock('@vercel/functions', () => ({ waitUntil: jest.fn() }));

const prisma = require('@/lib/prisma').default;
const paymentIntentRepo = require('@/lib/repositories/payment-intent.repository');
const regRepo = require('@/lib/repositories/event-registration.repository');
const eventRepo = require('@/lib/repositories/event.repository');
const userRepo = require('@/lib/repositories/user.repository');
const WompiService = require('@/lib/services/wompi.service');
const { sendRegistrationConfirmed } = require('@/lib/services/event-email.service');
const Sentry = require('@sentry/nextjs');
const { waitUntil } = require('@vercel/functions');
const service = require('@/lib/services/event-checkout.service');

const MIN = 60_000;
const HOUR = 60 * MIN;
const NOW = new Date('2026-10-03T15:00:00.000Z');
const START = new Date(NOW.getTime() + 48 * HOUR);
const END = new Date(START.getTime() + 2 * HOUR);
const USER = { id: 'u1', name: 'Ana Gómez', email: 'ana@uniandes.edu.co', phoneNumber: '+57 300 123 4567' };

const flush = () => new Promise((resolve) => setImmediate(resolve));

function event(overrides = {}) {
  return {
    id: 'e1',
    slug: 'repaso-x',
    title: 'Repaso X',
    status: 'Published',
    startsAt: START,
    endsAt: END,
    modality: 'Virtual',
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
    location: null,
    price: '20000',
    earlyBirdSlots: 5,
    earlyBirdPercent: 10,
    tutors: [{ tutor: { id: 't1', name: 'Tutor Uno' } }],
    ...overrides,
  };
}

/** Snake_case row returned by lockEvent (SELECT … FOR UPDATE). */
function locked(overrides = {}) {
  return {
    id: 'e1',
    status: 'Published',
    starts_at: START,
    ends_at: END,
    price: '20000',
    early_bird_slots: 5,
    early_bird_percent: 10,
    ...overrides,
  };
}

const FREE = { price: '0', earlyBirdSlots: null, earlyBirdPercent: null };
const FREE_LOCKED = { price: '0', early_bird_slots: null, early_bird_percent: null };

const err = (code) => expect.objectContaining({ code });
const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  WompiService.generateEventReference.mockReturnValue('EVT-1');
  userRepo.findById.mockResolvedValue(USER);
  sendRegistrationConfirmed.mockResolvedValue({ ok: true });
});

afterEach(() => console.error.mockRestore());

// ─── registerFree ────────────────────────────────────────────────────────

describe('registerFree', () => {
  beforeEach(() => {
    eventRepo.findBySlug.mockResolvedValue(event(FREE));
    regRepo.lockEvent.mockResolvedValue(locked(FREE_LOCKED));
    regRepo.findRegistration.mockResolvedValue(null);
  });

  it('locks the event, creates a Confirmed row at 0, stores the source and emails after the commit', async () => {
    const row = { id: 'r1', eventId: 'e1', userId: 'u1', status: 'Confirmed', finalAmount: '0' };
    mockTx.eventRegistration.create.mockResolvedValue(row);

    const result = await service.registerFree({ slug: 'repaso-x', userId: 'u1', source: 'ig', now: NOW });

    expect(result).toBe(row);
    expect(eventRepo.findBySlug).toHaveBeenCalledWith('repaso-x');
    expect(regRepo.lockEvent).toHaveBeenCalledWith(mockTx, 'e1');
    expect(regRepo.findRegistration).toHaveBeenCalledWith(mockTx, 'e1', 'u1');
    expect(regRepo.lockEvent.mock.invocationCallOrder[0]).toBeLessThan(
      regRepo.findRegistration.mock.invocationCallOrder[0],
    );
    expect(mockTx.eventRegistration.create).toHaveBeenCalledWith({
      data: {
        status: 'Confirmed',
        earlyBird: false,
        reservedAt: null,
        listPrice: 0,
        discountAmount: 0,
        finalAmount: 0,
        intentReference: null,
        confirmedAt: NOW,
        canceledAt: null,
        canceledBy: null,
        refundMethod: null,
        refundMethodDetails: null,
        eventId: 'e1',
        userId: 'u1',
        source: 'ig',
      },
    });
    expect(mockTx.eventRegistration.update).not.toHaveBeenCalled();
    expect(mockTx.user.updateMany).not.toHaveBeenCalled(); // no opt-in given

    // Kept alive past the response on Vercel (no-op elsewhere).
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
    await flush();
    expect(sendRegistrationConfirmed).toHaveBeenCalledTimes(1);
    expect(sendRegistrationConfirmed).toHaveBeenCalledWith({ event: event(FREE), registration: row, user: USER });
    expect(prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      sendRegistrationConfirmed.mock.invocationCallOrder[0],
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), TX_OPTIONS);
  });

  it('sets marketingOptInAt only when it is still null (updateMany guard)', async () => {
    mockTx.eventRegistration.create.mockResolvedValue({ id: 'r1', userId: 'u1', status: 'Confirmed' });

    await service.registerFree({ slug: 'repaso-x', userId: 'u1', marketingOptIn: true, now: NOW });

    expect(mockTx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', marketingOptInAt: null },
      data: { marketingOptInAt: NOW },
    });
  });

  it('is idempotent: an existing Confirmed row is returned with no write and no second email', async () => {
    const existing = { id: 'r1', status: 'Confirmed', finalAmount: '0' };
    regRepo.findRegistration.mockResolvedValue(existing);

    const result = await service.registerFree({ slug: 'repaso-x', userId: 'u1', marketingOptIn: true, now: NOW });

    expect(result).toBe(existing);
    expect(mockTx.eventRegistration.create).not.toHaveBeenCalled();
    expect(mockTx.eventRegistration.update).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
    await flush();
    expect(sendRegistrationConfirmed).not.toHaveBeenCalled();
  });

  it('turns a previously Canceled row back into Confirmed (source is never overwritten)', async () => {
    regRepo.findRegistration.mockResolvedValue({ id: 'r9', status: 'Canceled', source: 'wa' });
    const row = { id: 'r9', userId: 'u1', status: 'Confirmed' };
    mockTx.eventRegistration.update.mockResolvedValue(row);

    const result = await service.registerFree({ slug: 'repaso-x', userId: 'u1', source: 'ig', now: NOW });

    expect(result).toBe(row);
    expect(mockTx.eventRegistration.create).not.toHaveBeenCalled();
    const call = mockTx.eventRegistration.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'r9' });
    expect(call.data).toMatchObject({ status: 'Confirmed', confirmedAt: NOW, canceledAt: null, canceledBy: null, finalAmount: 0 });
    expect(call.data).not.toHaveProperty('source');
    await flush();
    expect(sendRegistrationConfirmed).toHaveBeenCalledTimes(1);
  });

  it('refuses a paid event with EVENT_IS_PAID', async () => {
    eventRepo.findBySlug.mockResolvedValue(event());
    regRepo.lockEvent.mockResolvedValue(locked());
    await expect(service.registerFree({ slug: 'repaso-x', userId: 'u1', now: NOW })).rejects.toEqual(err('EVENT_IS_PAID'));
    expect(mockTx.eventRegistration.create).not.toHaveBeenCalled();
  });

  it("refuses one of the event's tutors with EVENT_TUTOR before taking any lock", async () => {
    eventRepo.findBySlug.mockResolvedValue(event({ ...FREE, tutors: [{ tutor: { id: 't0' } }, { tutor: { id: 'u1' } }] }));
    await expect(service.registerFree({ slug: 'repaso-x', userId: 'u1', now: NOW })).rejects.toEqual(err('EVENT_TUTOR'));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mockTx.eventRegistration.create).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('hides Draft and unknown events with EVENT_NOT_FOUND (before taking any lock)', async () => {
    eventRepo.findBySlug.mockResolvedValue(event({ ...FREE, status: 'Draft' }));
    await expect(service.registerFree({ slug: 'repaso-x', userId: 'u1', now: NOW })).rejects.toEqual(err('EVENT_NOT_FOUND'));
    eventRepo.findBySlug.mockResolvedValue(null);
    await expect(service.registerFree({ slug: 'nope', userId: 'u1', now: NOW })).rejects.toEqual(err('EVENT_NOT_FOUND'));
    expect(regRepo.lockEvent).not.toHaveBeenCalled();
  });

  it('refuses a Canceled event, or one that already started, with EVENT_NOT_OPEN (read under the lock)', async () => {
    regRepo.lockEvent.mockResolvedValue(locked({ ...FREE_LOCKED, status: 'Canceled' }));
    await expect(service.registerFree({ slug: 'repaso-x', userId: 'u1', now: NOW })).rejects.toEqual(err('EVENT_NOT_OPEN'));

    regRepo.lockEvent.mockResolvedValue(locked(FREE_LOCKED));
    await expect(service.registerFree({ slug: 'repaso-x', userId: 'u1', now: START })).rejects.toEqual(err('EVENT_NOT_OPEN'));
    expect(mockTx.eventRegistration.create).not.toHaveBeenCalled();
  });
});

// ─── startCheckout ───────────────────────────────────────────────────────

describe('startCheckout', () => {
  const WIDGET = { reference: 'EVT-1', amountInCents: 1800000, currency: 'COP', publicKey: 'pub_test', signature: 'sig' };

  beforeEach(() => {
    eventRepo.findBySlug.mockResolvedValue(event());
    regRepo.lockEvent.mockResolvedValue(locked());
    regRepo.findRegistration.mockResolvedValue(null);
    regRepo.countEarlyBirdUsage.mockResolvedValue(4);
    mockTx.eventRegistration.create.mockResolvedValue({ id: 'r1' });
    mockTx.eventRegistration.update.mockResolvedValue({ id: 'r1' });
    paymentIntentRepo.create.mockResolvedValue({ reference: 'EVT-1' });
    WompiService.signWidgetIntent.mockReturnValue(WIDGET);
  });

  it('grants the early-bird while usage < slots: holds the seat and freezes the quote in the intent (tx client)', async () => {
    const result = await service.startCheckout({ slug: 'repaso-x', userId: 'u1', source: 'ig', marketingOptIn: true, now: NOW });

    expect(mockTx.eventRegistration.create).toHaveBeenCalledWith({
      data: {
        status: 'PendingPayment',
        earlyBird: true,
        reservedAt: NOW,
        listPrice: 20000,
        discountAmount: 2000,
        finalAmount: 18000,
        intentReference: 'EVT-1',
        canceledAt: null,
        canceledBy: null,
        eventId: 'e1',
        userId: 'u1',
        source: 'ig',
      },
    });
    expect(paymentIntentRepo.create).toHaveBeenCalledWith(
      {
        reference: 'EVT-1',
        kind: 'event',
        metadata: {
          kind: 'event',
          registrationId: 'r1',
          eventId: 'e1',
          studentId: 'u1',
          listPrice: '20000',
          discountAmount: '2000',
          finalAmount: '18000',
          earlyBird: true,
        },
      },
      mockTx,
    );
    expect(mockTx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', marketingOptInAt: null },
      data: { marketingOptInAt: NOW },
    });
    expect(WompiService.signWidgetIntent).toHaveBeenCalledWith({ reference: 'EVT-1', amount: 18000 });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), TX_OPTIONS);
    expect(result).toEqual({
      ...WIDGET,
      quote: { listPrice: 20000, discountAmount: 2000, finalAmount: 18000, earlyBird: true },
      customer: { email: 'ana@uniandes.edu.co', fullName: 'Ana Gómez', phoneNumber: '573001234567' },
    });
  });

  it('re-uses the existing row on a retry: new reference and hold, source untouched', async () => {
    regRepo.findRegistration.mockResolvedValue({ id: 'r1', status: 'PendingPayment', intentReference: 'EVT-0', source: 'wa' });

    await service.startCheckout({ slug: 'repaso-x', userId: 'u1', source: 'ig', now: NOW });

    expect(mockTx.eventRegistration.create).not.toHaveBeenCalled();
    const call = mockTx.eventRegistration.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'r1' });
    expect(call.data).toMatchObject({ status: 'PendingPayment', reservedAt: NOW, intentReference: 'EVT-1', earlyBird: true });
    expect(call.data).not.toHaveProperty('source');
  });

  it('charges the full price once the slots are taken (usage = slots)', async () => {
    regRepo.countEarlyBirdUsage.mockResolvedValue(5);

    const result = await service.startCheckout({ slug: 'repaso-x', userId: 'u1', now: NOW });

    expect(result.quote).toEqual({ listPrice: 20000, discountAmount: 0, finalAmount: 20000, earlyBird: false });
    expect(mockTx.eventRegistration.create.mock.calls[0][0].data).toMatchObject({ earlyBird: false, finalAmount: 20000 });
    expect(paymentIntentRepo.create.mock.calls[0][0].metadata).toMatchObject({
      earlyBird: false, discountAmount: '0', finalAmount: '20000',
    });
    expect(WompiService.signWidgetIntent).toHaveBeenCalledWith({ reference: 'EVT-1', amount: 20000 });
  });

  it('does not count usage when the event has no early-bird', async () => {
    regRepo.lockEvent.mockResolvedValue(locked({ early_bird_slots: null, early_bird_percent: null }));

    const result = await service.startCheckout({ slug: 'repaso-x', userId: 'u1', now: NOW });

    expect(regRepo.countEarlyBirdUsage).not.toHaveBeenCalled();
    expect(result.quote.earlyBird).toBe(false);
  });

  it('counts usage AFTER taking the event lock, excluding the caller, with the 30-min hold window', async () => {
    await service.startCheckout({ slug: 'repaso-x', userId: 'u1', now: NOW });

    expect(regRepo.countEarlyBirdUsage).toHaveBeenCalledWith(mockTx, { eventId: 'e1', excludeUserId: 'u1', holdMinutes: 30 });
    expect(regRepo.lockEvent.mock.invocationCallOrder[0]).toBeLessThan(
      regRepo.countEarlyBirdUsage.mock.invocationCallOrder[0],
    );
  });

  it('refuses ALREADY_REGISTERED, EVENT_IS_FREE and EVENT_NOT_OPEN without creating an intent', async () => {
    regRepo.findRegistration.mockResolvedValue({ id: 'r1', status: 'Confirmed' });
    await expect(service.startCheckout({ slug: 'repaso-x', userId: 'u1', now: NOW })).rejects.toEqual(err('ALREADY_REGISTERED'));

    regRepo.findRegistration.mockResolvedValue(null);
    regRepo.lockEvent.mockResolvedValue(locked(FREE_LOCKED));
    await expect(service.startCheckout({ slug: 'repaso-x', userId: 'u1', now: NOW })).rejects.toEqual(err('EVENT_IS_FREE'));

    regRepo.lockEvent.mockResolvedValue(locked({ status: 'Canceled' }));
    await expect(service.startCheckout({ slug: 'repaso-x', userId: 'u1', now: NOW })).rejects.toEqual(err('EVENT_NOT_OPEN'));

    regRepo.lockEvent.mockResolvedValue(locked());
    await expect(service.startCheckout({ slug: 'repaso-x', userId: 'u1', now: START })).rejects.toEqual(err('EVENT_NOT_OPEN'));

    expect(paymentIntentRepo.create).not.toHaveBeenCalled();
    expect(WompiService.signWidgetIntent).not.toHaveBeenCalled();
  });

  it("refuses one of the event's tutors with EVENT_TUTOR: no hold, no intent, no checkout", async () => {
    eventRepo.findBySlug.mockResolvedValue(event({ tutors: [{ tutor: { id: 'u1' } }] }));

    await expect(service.startCheckout({ slug: 'repaso-x', userId: 'u1', now: NOW })).rejects.toEqual(err('EVENT_TUTOR'));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mockTx.eventRegistration.create).not.toHaveBeenCalled();
    expect(paymentIntentRepo.create).not.toHaveBeenCalled();
    expect(WompiService.signWidgetIntent).not.toHaveBeenCalled();
  });

  it('propagates an intent persistence failure: no checkout is signed', async () => {
    paymentIntentRepo.create.mockRejectedValue(new Error('db down'));

    await expect(service.startCheckout({ slug: 'repaso-x', userId: 'u1', now: NOW })).rejects.toThrow('db down');
    expect(WompiService.signWidgetIntent).not.toHaveBeenCalled();
  });
});

// ─── fulfilPaidRegistration ──────────────────────────────────────────────

describe('fulfilPaidRegistration', () => {
  const STORED = {
    reference: 'EVT-1',
    kind: 'event',
    metadata: {
      kind: 'event',
      registrationId: 'r1',
      eventId: 'e1',
      studentId: 'u1',
      listPrice: '20000',
      discountAmount: '2000',
      finalAmount: '18000',
      earlyBird: true,
    },
  };
  const TX = { id: 'tx-1', reference: 'EVT-1', amount_in_cents: 1800000 };
  const PAYMENT = { id: 'p1', wompiId: 'tx-1' };
  const CONFIRMED_ROW = { id: 'r1', eventId: 'e1', userId: 'u1', status: 'Confirmed', finalAmount: '18000' };

  function pendingReg(overrides = {}) {
    return {
      id: 'r1',
      eventId: 'e1',
      userId: 'u1',
      status: 'PendingPayment',
      earlyBird: true,
      intentReference: 'EVT-1',
      reservedAt: new Date(NOW.getTime() - 10 * MIN),
      listPrice: '20000',
      discountAmount: '2000',
      finalAmount: '18000',
      ...overrides,
    };
  }

  beforeEach(() => {
    regRepo.findPaymentByWompiId.mockResolvedValue(null);
    regRepo.lockEvent.mockResolvedValue(locked());
    regRepo.lockRegistration.mockResolvedValue(pendingReg());
    regRepo.countEarlyBirdUsage.mockResolvedValue(0);
    mockTx.eventRegistration.update.mockResolvedValue(CONFIRMED_ROW);
    mockTx.eventPayment.create.mockResolvedValue(PAYMENT);
    mockTx.paymentIntent.update.mockResolvedValue({});
    eventRepo.findById.mockResolvedValue(event());
  });

  const paymentData = () => mockTx.eventPayment.create.mock.calls[0][0].data;

  it('confirms a fresh hold: locks event then registration, records the payment, consumes the intent, emails once', async () => {
    const result = await service.fulfilPaidRegistration(TX, STORED, NOW);

    expect(regRepo.findPaymentByWompiId).toHaveBeenNthCalledWith(1, mockTx, 'tx-1');
    expect(regRepo.lockEvent).toHaveBeenCalledWith(mockTx, 'e1');
    expect(regRepo.lockRegistration).toHaveBeenCalledWith(mockTx, 'r1');
    const order = (fn, i = 0) => fn.mock.invocationCallOrder[i];
    expect(order(regRepo.findPaymentByWompiId, 0)).toBeLessThan(order(regRepo.lockEvent));
    expect(order(regRepo.lockEvent)).toBeLessThan(order(regRepo.lockRegistration));
    expect(order(regRepo.lockRegistration)).toBeLessThan(order(regRepo.findPaymentByWompiId, 1));
    expect(regRepo.countEarlyBirdUsage).not.toHaveBeenCalled(); // fresh hold → no recount

    expect(mockTx.eventRegistration.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: {
        status: 'Confirmed',
        earlyBird: true,
        listPrice: 20000,
        discountAmount: 2000,
        finalAmount: 18000,
        intentReference: 'EVT-1',
        reservedAt: null,
        confirmedAt: NOW,
      },
    });
    expect(mockTx.eventPayment.create).toHaveBeenCalledWith({
      data: {
        registrationId: 'r1',
        wompiId: 'tx-1',
        reference: 'EVT-1',
        amount: 18000,
        originalAmount: 20000,
        discountAmount: 2000,
        flag: null,
        refundStatus: 'None',
      },
    });
    expect(mockTx.paymentIntent.update).toHaveBeenCalledWith({ where: { reference: 'EVT-1' }, data: { consumedAt: NOW } });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), TX_OPTIONS);
    expect(result).toEqual({ registration: CONFIRMED_ROW, payment: PAYMENT, flag: null, newlyConfirmed: true });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));

    await flush();
    expect(eventRepo.findById).toHaveBeenCalledWith('e1');
    expect(sendRegistrationConfirmed).toHaveBeenCalledTimes(1);
    expect(sendRegistrationConfirmed).toHaveBeenCalledWith({ event: event(), registration: CONFIRMED_ROW, user: USER });
  });

  it('honours a payment approved after the event started (slow PSE)', async () => {
    regRepo.lockEvent.mockResolvedValue(locked({ starts_at: new Date(NOW.getTime() - HOUR) }));

    const result = await service.fulfilPaidRegistration(TX, STORED, NOW);

    expect(result.newlyConfirmed).toBe(true);
    expect(paymentData()).toMatchObject({ flag: null, refundStatus: 'None' });
  });

  it('is a no-op when the wompiId is already recorded before taking the locks', async () => {
    regRepo.findPaymentByWompiId.mockResolvedValue({ id: 'p0' });

    await expect(service.fulfilPaidRegistration(TX, STORED, NOW)).resolves.toEqual({ alreadyProcessed: true });
    expect(regRepo.lockEvent).not.toHaveBeenCalled();
    expect(mockTx.eventRegistration.update).not.toHaveBeenCalled();
    expect(mockTx.eventPayment.create).not.toHaveBeenCalled();
    expect(mockTx.paymentIntent.update).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
    await flush();
    expect(sendRegistrationConfirmed).not.toHaveBeenCalled();
  });

  it('is a no-op when the twin delivery committed while we waited for the locks', async () => {
    regRepo.findPaymentByWompiId.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'p0' });

    await expect(service.fulfilPaidRegistration(TX, STORED, NOW)).resolves.toEqual({ alreadyProcessed: true });
    expect(regRepo.findPaymentByWompiId).toHaveBeenCalledTimes(2);
    expect(mockTx.eventRegistration.update).not.toHaveBeenCalled();
    expect(mockTx.eventPayment.create).not.toHaveBeenCalled();
    expect(mockTx.paymentIntent.update).not.toHaveBeenCalled();
    await flush();
    expect(sendRegistrationConfirmed).not.toHaveBeenCalled();
  });

  it('treats a P2002 unique violation on wompiId as already processed', async () => {
    mockTx.eventPayment.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));

    await expect(service.fulfilPaidRegistration(TX, STORED, NOW)).resolves.toEqual({ alreadyProcessed: true });
    await flush();
    expect(sendRegistrationConfirmed).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('propagates any other database error (the webhook must not acknowledge it)', async () => {
    mockTx.eventPayment.create.mockRejectedValue(Object.assign(new Error('connection lost'), { code: 'P1001' }));

    await expect(service.fulfilPaidRegistration(TX, STORED, NOW)).rejects.toThrow('connection lost');
  });

  it('a missing registration (user deleted) fails loudly: coded error + fatal Sentry, nothing written', async () => {
    regRepo.lockRegistration.mockResolvedValue(null);

    await expect(service.fulfilPaidRegistration(TX, STORED, NOW)).rejects.toMatchObject({ code: 'EVENT_REGISTRATION_MISSING' });

    expect(mockTx.eventRegistration.update).not.toHaveBeenCalled();
    expect(mockTx.eventPayment.create).not.toHaveBeenCalled();
    expect(mockTx.paymentIntent.update).not.toHaveBeenCalled();
    expect(mockScope.setLevel).toHaveBeenCalledWith('fatal');
    expect(mockScope.setContext).toHaveBeenCalledWith('event_payment', { wompiId: 'tx-1', reference: 'EVT-1', registrationId: 'r1' });
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.objectContaining({ code: 'EVENT_REGISTRATION_MISSING' }));
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('flags DUPLICATE (refund Pending) when the registration is already Confirmed, leaving it untouched', async () => {
    regRepo.lockRegistration.mockResolvedValue(pendingReg({ status: 'Confirmed', intentReference: 'EVT-0' }));

    const result = await service.fulfilPaidRegistration(TX, STORED, NOW);

    expect(mockTx.eventRegistration.update).not.toHaveBeenCalled();
    expect(paymentData()).toMatchObject({ registrationId: 'r1', wompiId: 'tx-1', amount: 18000, flag: 'DUPLICATE', refundStatus: 'Pending' });
    expect(mockTx.paymentIntent.update).toHaveBeenCalled();
    expect(result).toMatchObject({ flag: 'DUPLICATE', newlyConfirmed: false });
    expect(Sentry.captureMessage).toHaveBeenCalledWith(expect.stringContaining('DUPLICATE'));
    expect(mockScope.setLevel).toHaveBeenCalledWith('warning');
    await flush();
    expect(sendRegistrationConfirmed).not.toHaveBeenCalled();
  });

  it('flags EVENT_CANCELED (refund Pending) when the event was cancelled meanwhile', async () => {
    regRepo.lockEvent.mockResolvedValue(locked({ status: 'Canceled' }));
    regRepo.lockRegistration.mockResolvedValue(pendingReg({ status: 'Canceled' }));

    const result = await service.fulfilPaidRegistration(TX, STORED, NOW);

    expect(mockTx.eventRegistration.update).not.toHaveBeenCalled();
    expect(paymentData()).toMatchObject({ flag: 'EVENT_CANCELED', refundStatus: 'Pending' });
    expect(result.newlyConfirmed).toBe(false);
    expect(mockScope.setLevel).toHaveBeenCalledWith('warning');
  });

  it('flags REGISTRATION_CANCELED (refund Pending) when the user cancelled meanwhile', async () => {
    regRepo.lockRegistration.mockResolvedValue(pendingReg({ status: 'Canceled' }));

    const result = await service.fulfilPaidRegistration(TX, STORED, NOW);

    expect(mockTx.eventRegistration.update).not.toHaveBeenCalled();
    expect(paymentData()).toMatchObject({ flag: 'REGISTRATION_CANCELED', refundStatus: 'Pending' });
    expect(result.newlyConfirmed).toBe(false);
    await flush();
    expect(sendRegistrationConfirmed).not.toHaveBeenCalled();
  });

  describe('stale early-bird hold', () => {
    it('expired hold + slots exhausted → Confirmed at the paid price, flag EARLY_BIRD_OVERRUN, no refund', async () => {
      regRepo.lockRegistration.mockResolvedValue(pendingReg({ reservedAt: new Date(NOW.getTime() - 31 * MIN) }));
      regRepo.countEarlyBirdUsage.mockResolvedValue(5);

      const result = await service.fulfilPaidRegistration(TX, STORED, NOW);

      expect(regRepo.countEarlyBirdUsage).toHaveBeenCalledWith(mockTx, { eventId: 'e1', excludeUserId: 'u1', holdMinutes: 30 });
      expect(mockTx.eventRegistration.update.mock.calls[0][0].data).toMatchObject({
        status: 'Confirmed', earlyBird: true, finalAmount: 18000, discountAmount: 2000,
      });
      expect(paymentData()).toMatchObject({ amount: 18000, flag: 'EARLY_BIRD_OVERRUN', refundStatus: 'None' });
      expect(result).toMatchObject({ flag: 'EARLY_BIRD_OVERRUN', newlyConfirmed: true });
      expect(mockScope.setLevel).toHaveBeenCalledWith('info');
      await flush();
      expect(sendRegistrationConfirmed).toHaveBeenCalledTimes(1);
    });

    it('a replaced hold (intentReference ≠ reference) is stale too, even if recent', async () => {
      regRepo.lockRegistration.mockResolvedValue(pendingReg({ intentReference: 'EVT-2', reservedAt: NOW }));
      regRepo.countEarlyBirdUsage.mockResolvedValue(5);

      const result = await service.fulfilPaidRegistration(TX, STORED, NOW);

      expect(regRepo.countEarlyBirdUsage).toHaveBeenCalled();
      expect(mockTx.eventRegistration.update.mock.calls[0][0].data).toMatchObject({ intentReference: 'EVT-1' });
      expect(result.flag).toBe('EARLY_BIRD_OVERRUN');
    });

    it('expired hold with a slot still free → no flag', async () => {
      regRepo.lockRegistration.mockResolvedValue(pendingReg({ reservedAt: new Date(NOW.getTime() - 31 * MIN) }));
      regRepo.countEarlyBirdUsage.mockResolvedValue(4);

      const result = await service.fulfilPaidRegistration(TX, STORED, NOW);

      expect(paymentData()).toMatchObject({ flag: null, refundStatus: 'None' });
      expect(result).toMatchObject({ flag: null, newlyConfirmed: true });
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('a full-price intent is never recounted, however old its hold', async () => {
      const fullPrice = {
        ...STORED,
        metadata: { ...STORED.metadata, discountAmount: '0', finalAmount: '20000', earlyBird: false },
      };
      regRepo.lockRegistration.mockResolvedValue(pendingReg({ earlyBird: false, reservedAt: new Date(NOW.getTime() - 5 * HOUR) }));

      const result = await service.fulfilPaidRegistration({ ...TX, amount_in_cents: 2000000 }, fullPrice, NOW);

      expect(regRepo.countEarlyBirdUsage).not.toHaveBeenCalled();
      expect(mockTx.eventRegistration.update.mock.calls[0][0].data).toMatchObject({ earlyBird: false, finalAmount: 20000 });
      expect(paymentData()).toMatchObject({ amount: 20000, originalAmount: 20000, discountAmount: 0, flag: null });
      expect(result.flag).toBeNull();
    });
  });
});

// ─── cancelRegistration ──────────────────────────────────────────────────

describe('cancelRegistration', () => {
  const PAID_ROW = { id: 'r1', eventId: 'e1', userId: 'u1', status: 'Confirmed', finalAmount: '18000' };
  const CANCELED_ROW = { ...PAID_ROW, status: 'Canceled' };
  const at = (msBeforeStart) => new Date(START.getTime() - msBeforeStart);

  beforeEach(() => {
    eventRepo.findBySlug.mockResolvedValue(event());
    regRepo.lockEvent.mockResolvedValue(locked());
    regRepo.findRegistration.mockResolvedValue(PAID_ROW);
    mockTx.eventRegistration.update.mockResolvedValue(CANCELED_ROW);
    mockTx.eventPayment.updateMany.mockResolvedValue({ count: 1 });
  });

  it('paid, exactly 6 h before start, with refund details → Canceled by user and the payment queued for refund', async () => {
    const now = at(6 * HOUR);

    const result = await service.cancelRegistration({
      slug: 'repaso-x', userId: 'u1', refundMethod: 'nequi', refundMethodDetails: '3001234567', now,
    });

    expect(regRepo.lockEvent).toHaveBeenCalledWith(mockTx, 'e1');
    expect(regRepo.findRegistration).toHaveBeenCalledWith(mockTx, 'e1', 'u1');
    expect(mockTx.eventRegistration.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: {
        status: 'Canceled',
        canceledAt: now,
        canceledBy: 'user',
        refundMethod: 'nequi',
        refundMethodDetails: '3001234567',
      },
    });
    expect(mockTx.eventPayment.updateMany).toHaveBeenCalledWith({
      where: { registrationId: 'r1', refundStatus: 'None' },
      data: { refundStatus: 'Pending' },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), TX_OPTIONS);
    expect(result).toEqual({ registration: CANCELED_ROW, refundable: true });
  });

  it('queues the refund of an EARLY_BIRD_OVERRUN-confirmed payment too (no flag filter)', async () => {
    // Overrun payments are confirmed with refundStatus None; flagged refunds
    // (DUPLICATE / *_CANCELED) are already Pending, so only None moves.
    regRepo.findRegistration.mockResolvedValue({ ...PAID_ROW, earlyBird: true });

    const result = await service.cancelRegistration({
      slug: 'repaso-x', userId: 'u1', refundMethod: 'llave', refundMethodDetails: '@ana', now: at(7 * HOUR),
    });

    expect(result.refundable).toBe(true);
    const { where, data } = mockTx.eventPayment.updateMany.mock.calls[0][0];
    expect(where).toEqual({ registrationId: 'r1', refundStatus: 'None' });
    expect(where).not.toHaveProperty('flag');
    expect(data).toEqual({ refundStatus: 'Pending' });
  });

  it('paid at 6 h without refund details → REFUND_DETAILS_REQUIRED, nothing written', async () => {
    await expect(service.cancelRegistration({ slug: 'repaso-x', userId: 'u1', now: at(6 * HOUR) }))
      .rejects.toEqual(err('REFUND_DETAILS_REQUIRED'));
    await expect(service.cancelRegistration({ slug: 'repaso-x', userId: 'u1', refundMethod: 'nequi', now: at(6 * HOUR) }))
      .rejects.toEqual(err('REFUND_DETAILS_REQUIRED'));
    expect(mockTx.eventRegistration.update).not.toHaveBeenCalled();
    expect(mockTx.eventPayment.updateMany).not.toHaveBeenCalled();
  });

  it('paid at 5 h 59 min → cancelled with no refund; the refund details sent are ignored', async () => {
    const now = at(6 * HOUR - MIN);

    const result = await service.cancelRegistration({
      slug: 'repaso-x', userId: 'u1', refundMethod: 'nequi', refundMethodDetails: '3001234567', now,
    });

    expect(mockTx.eventRegistration.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { status: 'Canceled', canceledAt: now, canceledBy: 'user' },
    });
    expect(mockTx.eventPayment.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ registration: CANCELED_ROW, refundable: false });
  });

  it('free registration → cancelled, never refundable', async () => {
    eventRepo.findBySlug.mockResolvedValue(event(FREE));
    regRepo.lockEvent.mockResolvedValue(locked(FREE_LOCKED));
    regRepo.findRegistration.mockResolvedValue({ ...PAID_ROW, finalAmount: '0' });

    const result = await service.cancelRegistration({ slug: 'repaso-x', userId: 'u1', now: NOW });

    expect(mockTx.eventRegistration.update.mock.calls[0][0].data).toMatchObject({ status: 'Canceled', canceledBy: 'user' });
    expect(mockTx.eventPayment.updateMany).not.toHaveBeenCalled();
    expect(result.refundable).toBe(false);
  });

  it('refuses once the event started, or when it is not Published, with EVENT_NOT_OPEN', async () => {
    await expect(service.cancelRegistration({ slug: 'repaso-x', userId: 'u1', now: START }))
      .rejects.toEqual(err('EVENT_NOT_OPEN'));
    regRepo.lockEvent.mockResolvedValue(locked({ status: 'Canceled' }));
    await expect(service.cancelRegistration({ slug: 'repaso-x', userId: 'u1', now: NOW }))
      .rejects.toEqual(err('EVENT_NOT_OPEN'));
    expect(mockTx.eventRegistration.update).not.toHaveBeenCalled();
  });

  it('refuses NOT_REGISTERED unless the registration is Confirmed (a PendingPayment hold just expires)', async () => {
    regRepo.findRegistration.mockResolvedValue({ ...PAID_ROW, status: 'PendingPayment' });
    await expect(service.cancelRegistration({ slug: 'repaso-x', userId: 'u1', now: NOW })).rejects.toEqual(err('NOT_REGISTERED'));
    regRepo.findRegistration.mockResolvedValue({ ...PAID_ROW, status: 'Canceled' });
    await expect(service.cancelRegistration({ slug: 'repaso-x', userId: 'u1', now: NOW })).rejects.toEqual(err('NOT_REGISTERED'));
    regRepo.findRegistration.mockResolvedValue(null);
    await expect(service.cancelRegistration({ slug: 'repaso-x', userId: 'u1', now: NOW })).rejects.toEqual(err('NOT_REGISTERED'));
    expect(mockTx.eventRegistration.update).not.toHaveBeenCalled();
  });
});
