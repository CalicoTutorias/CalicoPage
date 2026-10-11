/**
 * @jest-environment node
 *
 * session-checkout.service — the shared booking write and the free
 * (100 % courtesy coupon) checkout that never touches Wompi.
 */

jest.mock('@/lib/repositories/payment.repository', () => ({
  create: jest.fn(),
  createWithCouponRedemption: jest.fn(),
  incrementTutorNextPayment: jest.fn(),
}));
jest.mock('@/lib/repositories/payment-intent.repository', () => ({
  create: jest.fn(),
  markConsumed: jest.fn(),
}));
jest.mock('@/lib/repositories/session.repository', () => ({ updateSession: jest.fn() }));
jest.mock('@/lib/services/session.service', () => ({ bookPaidSession: jest.fn() }));
jest.mock('@/lib/services/notification.service', () => ({ notifyPaymentConfirmed: jest.fn() }));
jest.mock('@/lib/services/admin-metrics.service', () => ({ invalidateAllMetrics: jest.fn() }));
jest.mock('@/lib/services/coupon.service', () => ({
  isCouponError: jest.fn((err) => String(err?.code || '').startsWith('COUPON_')),
}));

const paymentRepo = require('@/lib/repositories/payment.repository');
const paymentIntentRepo = require('@/lib/repositories/payment-intent.repository');
const sessionRepo = require('@/lib/repositories/session.repository');
const sessionService = require('@/lib/services/session.service');
const notificationService = require('@/lib/services/notification.service');
const { bookFreeSession, recordPaidSessionBooking } = require('@/lib/services/session-checkout.service');

const DISCOUNT = {
  couponId: 'coupon-free', couponCode: 'CORTESIA', absorber: 'CALICO', redemptionId: 'red-1',
  originalAmount: 45000, discountAmount: 45000, tutorPayoutBase: 45000,
};
const INPUT = {
  reference: 'TXN-FREE',
  studentId: 'student-1',
  tutorId: 'tutor-1',
  courseId: 'course-1',
  durationMinutes: 60,
  startTimestamp: new Date('2026-10-12T15:00:00.000Z'),
  endTimestamp: new Date('2026-10-12T16:00:00.000Z'),
  topicsToReview: 'Cambio de variable en integrales dobles',
  attachments: [{ s3Key: 'k1', fileName: 'Ejercicio.png', fileSize: 10, mimeType: 'image/png' }],
  discount: DISCOUNT,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  sessionService.bookPaidSession.mockResolvedValue({ id: 'sess-1' });
  paymentRepo.createWithCouponRedemption.mockResolvedValue({ payment: { id: 'pay-1', status: 'paid' }, outcome: 'approved' });
  paymentRepo.create.mockResolvedValue({ id: 'pay-plain', status: 'paid' });
});
afterEach(() => {
  console.log.mockRestore();
  console.error.mockRestore();
});

describe('bookFreeSession', () => {
  it('persists the intent, books the session and records a paid 0-amount payment on the list-price payout base', async () => {
    const result = await bookFreeSession(INPUT);

    expect(paymentIntentRepo.create).toHaveBeenCalledWith({
      reference: 'TXN-FREE',
      kind: 'session',
      metadata: expect.objectContaining({
        studentId: 'student-1', tutorId: 'tutor-1', courseId: 'course-1',
        couponId: 'coupon-free', couponCode: 'CORTESIA', couponAbsorber: 'CALICO',
        originalAmount: '45000', discountAmount: '45000', tutorPayoutBase: '45000',
        attachments: JSON.stringify(INPUT.attachments),
        free: 'true',
      }),
    });

    expect(sessionService.bookPaidSession).toHaveBeenCalledWith(expect.objectContaining({
      studentId: 'student-1', tutorId: 'tutor-1', courseId: 'course-1',
      topicsToReview: INPUT.topicsToReview,
      attachments: INPUT.attachments,
      notes: 'Booked via payment intent TXN-FREE',
    }));

    const [paymentInput, redemption] = paymentRepo.createWithCouponRedemption.mock.calls[0];
    expect(paymentInput).toEqual({
      sessionId: 'sess-1', studentId: 'student-1', tutorId: 'tutor-1',
      amount: 0, originalAmount: 45000, discountAmount: 45000, tutorPayoutBase: 45000,
      couponId: 'coupon-free', status: 'paid', wompiId: null,
    });
    expect(redemption).toMatchObject({
      intentReference: 'TXN-FREE', couponId: 'coupon-free', userId: 'student-1', check: null,
      snapshot: { originalAmount: 45000, discountAmount: 45000, finalAmount: 0, tutorPayoutBase: 45000, absorber: 'CALICO' },
    });
    expect(paymentRepo.create).not.toHaveBeenCalled();

    // The tutor is still owed their share of the list price (Calico absorbs).
    expect(paymentRepo.incrementTutorNextPayment).toHaveBeenCalledWith('tutor-1', 45000);
    expect(paymentIntentRepo.markConsumed).toHaveBeenCalledWith('TXN-FREE');
    expect(notificationService.notifyPaymentConfirmed).toHaveBeenCalledWith('student-1', { id: 'sess-1' });
    expect(result).toEqual({ payment: { id: 'pay-1', status: 'paid' }, session: { id: 'sess-1' }, reference: 'TXN-FREE' });
  });

  it('refuses anything that is not a full-price discount', async () => {
    await expect(bookFreeSession({ ...INPUT, discount: { ...DISCOUNT, discountAmount: 44000 } })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(bookFreeSession({ ...INPUT, discount: null })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(sessionService.bookPaidSession).not.toHaveBeenCalled();
    expect(paymentIntentRepo.create).not.toHaveBeenCalled();
  });

  it('lets a refused slot bubble up with its code and writes no payment', async () => {
    sessionService.bookPaidSession.mockRejectedValue(Object.assign(new Error('taken'), { code: 'SESSION_CONFLICT' }));
    await expect(bookFreeSession(INPUT)).rejects.toMatchObject({ code: 'SESSION_CONFLICT' });
    expect(paymentRepo.createWithCouponRedemption).not.toHaveBeenCalled();
    expect(paymentIntentRepo.markConsumed).not.toHaveBeenCalled();
  });

  it('cancels the session when the payment row cannot be written', async () => {
    paymentRepo.createWithCouponRedemption.mockRejectedValue(new Error('db down'));
    await expect(bookFreeSession(INPUT)).rejects.toThrow('db down');
    expect(sessionRepo.updateSession).toHaveBeenCalledWith('sess-1', { status: 'Canceled' });
    expect(paymentIntentRepo.markConsumed).not.toHaveBeenCalled();
  });
});

describe('recordPaidSessionBooking (Wompi path)', () => {
  it('records a plain payment with the Wompi id when there is no coupon', async () => {
    const result = await recordPaidSessionBooking({
      reference: 'TXN-1', wompiTransactionId: 'wompi-1',
      studentId: 'student-1', tutorId: 'tutor-1', courseId: 'course-1',
      startTimestamp: '2026-10-12T15:00:00.000Z', endTimestamp: '2026-10-12T16:00:00.000Z',
      topicsToReview: null, attachments: [],
      amountInPesos: 45000,
      breakdown: { originalAmount: 45000, discountAmount: 0, tutorPayoutBase: 45000, couponId: null },
    });
    expect(paymentRepo.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 45000, wompiId: 'wompi-1', status: 'paid' }));
    expect(paymentRepo.createWithCouponRedemption).not.toHaveBeenCalled();
    expect(result.payment.id).toBe('pay-plain');
  });
});
