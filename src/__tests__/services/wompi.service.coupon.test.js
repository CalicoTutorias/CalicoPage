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

const crypto = require('crypto');
const paymentRepo = require('@/lib/repositories/payment.repository');
const paymentIntentRepo = require('@/lib/repositories/payment-intent.repository');
const couponRepo = require('@/lib/repositories/coupon.repository');
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
    redemptionsApproved: 1,
  });
  couponRepo.findRedemptionByReference.mockResolvedValue({ id: 'red-1', status: 'RESERVED', reservedAt: new Date() });
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
      { intentReference: 'TXN-REF-1' },
    );
    // Tutor credited on the BASE (Calico absorbed the discount), not the charge.
    expect(paymentRepo.incrementTutorNextPayment).toHaveBeenCalledWith('99', 60000);
    expect(couponRepo.createApproved).not.toHaveBeenCalled();
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

  it('self-heals a missing redemption row so the use is still traced', async () => {
    couponRepo.findRedemptionByReference.mockResolvedValue(null);
    paymentRepo.createWithCouponRedemption.mockResolvedValue({
      payment: { id: 'pay_1', amount: 54000 },
      redemptionsApproved: 0,
    });

    await wompiService.processSuccessfulPayment(approvedTransaction());

    expect(couponRepo.createApproved).toHaveBeenCalledWith(expect.objectContaining({
      couponId: 'coupon-1',
      userId: '42',
      intentReference: 'TXN-REF-1',
      paymentId: 'pay_1',
      sessionId: 'sess_abc',
      snapshot: expect.objectContaining({ originalAmount: 60000, discountAmount: 6000, finalAmount: 54000, tutorPayoutBase: 60000, absorber: 'CALICO' }),
    }));
  });

  it('honours a hold that expired while the bank was confirming (logged, not refused)', async () => {
    couponRepo.findRedemptionByReference.mockResolvedValue({
      id: 'red-1', status: 'RESERVED', reservedAt: new Date(Date.now() - 45 * 60_000),
    });

    await wompiService.processSuccessfulPayment(approvedTransaction());

    expect(paymentRepo.createWithCouponRedemption).toHaveBeenCalledTimes(1);
    expect(couponRepo.createApproved).not.toHaveBeenCalled();
  });

  it('rolls the session back if the atomic payment+redemption write fails', async () => {
    const sessionRepo = require('@/lib/repositories/session.repository');
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
