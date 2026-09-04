/**
 * Coupon path of wompi.service:
 *   - createPaymentIntent signs the DISCOUNTED amount and freezes the coupon
 *     snapshot into the intent metadata;
 *   - processSuccessfulPayment builds the payment row from the snapshot,
 *     approves the redemption atomically and credits the tutor payout BASE;
 *   - a paid amount that contradicts the snapshot is refused before any
 *     session is booked;
 *   - a failed payment releases the coupon hold.
 */

jest.mock('@/lib/repositories/payment.repository', () => ({
  findByWompiId: jest.fn(),
  create: jest.fn(),
  createWithCouponRedemption: jest.fn(),
  incrementTutorNextPayment: jest.fn(),
}));
jest.mock('@/lib/repositories/payment-intent.repository', () => ({
  create: jest.fn(),
  findByReference: jest.fn(),
  markConsumed: jest.fn(),
}));
jest.mock('@/lib/repositories/coupon.repository', () => ({
  findRedemptionByReference: jest.fn(),
  releaseByReference: jest.fn(),
  createApproved: jest.fn(),
}));
jest.mock('@/lib/repositories/session.repository', () => ({
  updateSession: jest.fn(),
}));
jest.mock('@/lib/services/session.service', () => ({
  bookPaidSession: jest.fn(),
}));
jest.mock('@/lib/services/notification.service', () => ({
  notifyPaymentConfirmed: jest.fn(),
  notifyPaymentFailed: jest.fn(),
}));
jest.mock('@/lib/services/admin-metrics.service', () => ({
  invalidateAllMetrics: jest.fn(),
}));
jest.mock('@/lib/services/coupon.service', () => ({
  prepareRedemptionApproval: jest.fn(),
  isCouponError: jest.fn((err) => String(err?.code || '').startsWith('COUPON_')),
}));

const crypto = require('crypto');
const paymentRepo = require('@/lib/repositories/payment.repository');
const paymentIntentRepo = require('@/lib/repositories/payment-intent.repository');
const couponRepo = require('@/lib/repositories/coupon.repository');
const couponService = require('@/lib/services/coupon.service');
const sessionRepo = require('@/lib/repositories/session.repository');
const sessionService = require('@/lib/services/session.service');
const { invalidateAllMetrics } = require('@/lib/services/admin-metrics.service');
const wompiService = require('@/lib/services/wompi.service');

const CORE_METADATA = {
  studentId: '42',
  tutorId: '99',
  courseId: 'course-uuid',
  durationMinutes: '60',
  startTimestamp: '2026-09-15T15:00:00.000Z',
  endTimestamp: '2026-09-15T16:00:00.000Z',
  topicsToReview: 'Derivadas',
  attachments: '[]',
};

const SNAPSHOT = {
  couponId: 'coupon-1',
  couponCode: 'PROMO10',
  couponAbsorber: 'CALICO',
  couponRedemptionId: 'red-1',
  originalAmount: '60000',
  discountAmount: '6000',
  tutorPayoutBase: '60000',
};

function approvedTransaction(overrides = {}) {
  return {
    id: 'wompi-txn-1',
    reference: 'TXN-REF-1',
    amount_in_cents: 5400000, // 54 000 COP = 60 000 − 6 000
    status: 'APPROVED',
    metadata: {}, // Wompi's lookup does not echo our metadata
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.WOMPI_PUBLIC_KEY = 'pub_test_xyz';
  process.env.WOMPI_PRIVATE_KEY = 'pub_test_xyz';
  process.env.WOMPI_INTEGRITY_SECRET = 'integrity_secret_for_tests';
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

  paymentIntentRepo.create.mockResolvedValue({ id: 'intent-row-1' });
  paymentIntentRepo.findByReference.mockResolvedValue({ metadata: { ...CORE_METADATA, ...SNAPSHOT } });
  paymentIntentRepo.markConsumed.mockResolvedValue(undefined);
  paymentRepo.findByWompiId.mockResolvedValue(null);
  paymentRepo.incrementTutorNextPayment.mockResolvedValue(undefined);
  paymentRepo.createWithCouponRedemption.mockResolvedValue({
    payment: { id: 'pay_1', amount: 54000 },
    outcome: 'approved',
  });
  // Default: a fresh RESERVED hold → approve as-is (no re-check).
  couponService.prepareRedemptionApproval.mockResolvedValue({
    fresh: true,
    existing: { id: 'red-1', status: 'RESERVED', reservedAt: new Date() },
    check: null,
  });
  couponRepo.releaseByReference.mockResolvedValue({ count: 1 });
  sessionService.bookPaidSession.mockResolvedValue({ id: 'sess_abc', tutorId: '99' });
});

// ─── createPaymentIntent with a discount ─────────────────────────────────

describe('createPaymentIntent — coupon', () => {
  const discount = {
    couponId: 'coupon-1',
    couponCode: 'PROMO10',
    absorber: 'CALICO',
    redemptionId: 'red-1',
    originalAmount: 60000,
    discountAmount: 6000,
    tutorPayoutBase: 60000,
  };

  it('signs the discounted amount, keeps the preset reference and freezes the snapshot', async () => {
    const intent = await wompiService.createPaymentIntent({
      studentId: '42',
      tutorId: '99',
      courseId: 'course-uuid',
      amount: 54000,
      durationMinutes: 60,
      startTimestamp: new Date('2026-09-15T15:00:00.000Z'),
      endTimestamp: new Date('2026-09-15T16:00:00.000Z'),
      redirectUrl: 'http://localhost:3000/payments/confirm',
      topicsToReview: 'Derivadas',
      attachments: [],
      reference: 'TXN-PRESET',
      discount,
    });

    expect(intent.reference).toBe('TXN-PRESET');
    expect(intent.amountInCents).toBe(5400000);
    const expectedSig = crypto
      .createHash('sha256')
      .update('TXN-PRESET5400000COPintegrity_secret_for_tests')
      .digest('hex');
    expect(intent.signature).toBe(expectedSig);

    expect(intent.metadata).toMatchObject({
      couponId: 'coupon-1',
      couponCode: 'PROMO10',
      couponAbsorber: 'CALICO',
      couponRedemptionId: 'red-1',
      originalAmount: '60000',
      discountAmount: '6000',
      tutorPayoutBase: '60000',
    });
    expect(intent.pricing).toEqual({
      originalAmount: 60000, discountAmount: 6000, amount: 54000, couponCode: 'PROMO10',
    });
    expect(paymentIntentRepo.create).toHaveBeenCalledWith({
      reference: 'TXN-PRESET',
      metadata: expect.objectContaining({ couponRedemptionId: 'red-1', discountAmount: '6000' }),
    });
  });

  it('without a coupon the snapshot still records list price = charge, discount 0', async () => {
    const intent = await wompiService.createPaymentIntent({
      studentId: '42', tutorId: '99', courseId: 'course-uuid', amount: 50000, durationMinutes: 60,
      startTimestamp: new Date('2026-09-15T15:00:00.000Z'), endTimestamp: new Date('2026-09-15T16:00:00.000Z'),
      redirectUrl: 'x', topicsToReview: '', attachments: [],
    });
    expect(intent.metadata).toMatchObject({ originalAmount: '50000', discountAmount: '0', tutorPayoutBase: '50000' });
    expect(intent.metadata.couponId).toBeUndefined();
    expect(intent.pricing).toEqual({ originalAmount: 50000, discountAmount: 0, amount: 50000, couponCode: null });
    expect(intent.reference).toMatch(/^TXN-/);
  });
});

// ─── processSuccessfulPayment with a snapshot ────────────────────────────

describe('processSuccessfulPayment — coupon snapshot', () => {
  it('creates the paid row from the snapshot and approves the redemption atomically', async () => {
    const result = await wompiService.processSuccessfulPayment(approvedTransaction());

    expect(paymentRepo.create).not.toHaveBeenCalled();
    expect(couponService.prepareRedemptionApproval).toHaveBeenCalledWith({
      couponId: 'coupon-1', intentReference: 'TXN-REF-1', userId: '42',
    });
    expect(paymentRepo.createWithCouponRedemption).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess_abc',
        studentId: '42',
        tutorId: '99',
        amount: 54000,
        originalAmount: 60000,
        discountAmount: 6000,
        tutorPayoutBase: 60000,
        couponId: 'coupon-1',
        status: 'paid',
        wompiId: 'wompi-txn-1',
      }),
      {
        intentReference: 'TXN-REF-1',
        couponId: 'coupon-1',
        userId: '42',
        snapshot: { originalAmount: 60000, discountAmount: 6000, finalAmount: 54000, tutorPayoutBase: 60000, absorber: 'CALICO' },
        check: null, // fresh hold: its slot was counted at reservation
      },
    );
    // Tutor credited on the BASE (Calico absorbed the discount), not the charge.
    expect(paymentRepo.incrementTutorNextPayment).toHaveBeenCalledWith('99', 60000);
    expect(invalidateAllMetrics).toHaveBeenCalledTimes(1);
    expect(result.payment.id).toBe('pay_1');
  });

  it('SHARED coupons credit the tutor on the discounted amount', async () => {
    paymentIntentRepo.findByReference.mockResolvedValue({
      metadata: { ...CORE_METADATA, ...SNAPSHOT, couponAbsorber: 'SHARED', tutorPayoutBase: '54000' },
    });

    await wompiService.processSuccessfulPayment(approvedTransaction());

    expect(paymentRepo.createWithCouponRedemption.mock.calls[0][0]).toMatchObject({ tutorPayoutBase: 54000 });
    expect(paymentRepo.incrementTutorNextPayment).toHaveBeenCalledWith('99', 54000);
  });

  it('refuses a paid amount that contradicts the snapshot BEFORE booking anything', async () => {
    await expect(
      wompiService.processSuccessfulPayment(approvedTransaction({ amount_in_cents: 6000000 })),
    ).rejects.toMatchObject({ code: 'AMOUNT_MISMATCH', wompiTransactionId: 'wompi-txn-1' });

    expect(sessionService.bookPaidSession).not.toHaveBeenCalled();
    expect(paymentRepo.createWithCouponRedemption).not.toHaveBeenCalled();
    expect(paymentRepo.incrementTutorNextPayment).not.toHaveBeenCalled();
  });

  it('a stale/missing hold is re-validated under the coupon lock (check handed to the repository)', async () => {
    const check = jest.fn();
    couponService.prepareRedemptionApproval.mockResolvedValue({ fresh: false, existing: null, check });
    paymentRepo.createWithCouponRedemption.mockResolvedValue({
      payment: { id: 'pay_1', amount: 54000 },
      outcome: 'created',
    });

    await wompiService.processSuccessfulPayment(approvedTransaction());

    const opts = paymentRepo.createWithCouponRedemption.mock.calls[0][1];
    expect(opts.check).toBe(check);
    expect(opts.snapshot).toMatchObject({ originalAmount: 60000, discountAmount: 6000, finalAmount: 54000 });
    expect(paymentRepo.incrementTutorNextPayment).toHaveBeenCalledWith('99', 60000);
  });

  it('honours a hold that expired while the bank was confirming, as long as the limits still hold', async () => {
    couponService.prepareRedemptionApproval.mockResolvedValue({
      fresh: false,
      existing: { id: 'red-1', status: 'RESERVED', reservedAt: new Date(Date.now() - 45 * 60_000) },
      check: jest.fn(),
    });

    const result = await wompiService.processSuccessfulPayment(approvedTransaction());

    expect(paymentRepo.createWithCouponRedemption).toHaveBeenCalledTimes(1);
    expect(result.payment.id).toBe('pay_1');
  });

  it('refuses BEFORE booking when the limits would be exceeded (pre-minted intents cannot all be paid)', async () => {
    couponService.prepareRedemptionApproval.mockRejectedValue(
      Object.assign(new Error('limit'), { code: 'COUPON_USER_LIMIT' }),
    );

    await expect(wompiService.processSuccessfulPayment(approvedTransaction()))
      .rejects.toMatchObject({ code: 'COUPON_LIMIT_EXCEEDED', reason: 'COUPON_USER_LIMIT', wompiTransactionId: 'wompi-txn-1' });

    expect(sessionService.bookPaidSession).not.toHaveBeenCalled();
    expect(paymentRepo.createWithCouponRedemption).not.toHaveBeenCalled();
    expect(paymentRepo.incrementTutorNextPayment).not.toHaveBeenCalled();
  });

  it('refuses inside the atomic write too (authoritative check) and rolls the session back', async () => {
    couponService.prepareRedemptionApproval.mockResolvedValue({ fresh: false, existing: null, check: jest.fn() });
    paymentRepo.createWithCouponRedemption.mockRejectedValue(
      Object.assign(new Error('exhausted'), { code: 'COUPON_EXHAUSTED' }),
    );

    await expect(wompiService.processSuccessfulPayment(approvedTransaction()))
      .rejects.toMatchObject({ code: 'COUPON_LIMIT_EXCEEDED', reason: 'COUPON_EXHAUSTED' });

    expect(sessionRepo.updateSession).toHaveBeenCalledWith('sess_abc', { status: 'Canceled' });
    expect(paymentRepo.incrementTutorNextPayment).not.toHaveBeenCalled();
  });

  it('refuses a second Wompi transaction for an intent that already produced a payment', async () => {
    paymentIntentRepo.findByReference.mockResolvedValue({
      metadata: { ...CORE_METADATA, ...SNAPSHOT },
      consumedAt: new Date(),
    });

    await expect(wompiService.processSuccessfulPayment(approvedTransaction({ id: 'wompi-txn-2' })))
      .rejects.toMatchObject({ code: 'INTENT_CONSUMED', wompiTransactionId: 'wompi-txn-2' });

    expect(sessionService.bookPaidSession).not.toHaveBeenCalled();
    expect(paymentRepo.createWithCouponRedemption).not.toHaveBeenCalled();
  });

  it('rolls the session back if the atomic payment+redemption write fails', async () => {
    paymentRepo.createWithCouponRedemption.mockRejectedValue(new Error('db down'));

    await expect(wompiService.processSuccessfulPayment(approvedTransaction())).rejects.toThrow('db down');
    expect(sessionRepo.updateSession).toHaveBeenCalledWith('sess_abc', { status: 'Canceled' });
  });
});

// ─── handleFailedPayment ─────────────────────────────────────────────────

describe('handleFailedPayment — coupon hold', () => {
  it('releases the hold of the failed intent', async () => {
    await wompiService.handleFailedPayment({
      wompiTransactionId: 'wompi-txn-2',
      reference: 'TXN-REF-1',
      reason: 'DECLINED',
      studentId: '42',
    });
    expect(couponRepo.releaseByReference).toHaveBeenCalledWith('TXN-REF-1');
  });

  it('does not throw when the release itself fails', async () => {
    couponRepo.releaseByReference.mockRejectedValue(new Error('db down'));
    await expect(wompiService.handleFailedPayment({
      wompiTransactionId: 'w', reference: 'TXN-REF-1', reason: 'ERROR', studentId: '42',
    })).resolves.toBeUndefined();
  });
});
