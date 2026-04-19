/**
 * Unit tests for wompi.service.processSuccessfulPayment — the post-refactor
 * entry point invoked from the webhook on APPROVED transactions.
 *
 * After the refactor, wompi only: (1) dedups, (2) delegates session creation
 * to sessionService.bookPaidSession, (3) records the payment, (4) notifies
 * payment-confirmed. This suite pins that contract.
 */

jest.mock('@/lib/repositories/payment.repository', () => ({
  findByWompiId: jest.fn(),
  create: jest.fn(),
}));
jest.mock('@/lib/services/session.service', () => ({
  bookPaidSession: jest.fn(),
}));
jest.mock('@/lib/services/notification.service', () => ({
  notifyPaymentConfirmed: jest.fn(),
}));

const paymentRepo = require('@/lib/repositories/payment.repository');
const sessionService = require('@/lib/services/session.service');
const notificationService = require('@/lib/services/notification.service');
const wompiService = require('@/lib/services/wompi.service');

function baseTransaction(overrides = {}) {
  return {
    id: 'wompi-txn-1',
    reference: 'TXN-REF-1',
    amount_in_cents: 5000000,
    status: 'APPROVED',
    metadata: {
      studentId: '42',
      tutorId: '99',
      courseId: 'course-uuid',
      durationMinutes: '60',
      startTimestamp: '2026-04-15T15:00:00.000Z',
      endTimestamp: '2026-04-15T16:00:00.000Z',
      topicsToReview: 'Derivadas',
      attachments: JSON.stringify([
        { s3Key: 'k', fileName: 'notes.pdf', fileSize: 1, mimeType: 'application/pdf' },
      ]),
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('processSuccessfulPayment — happy path', () => {
  it('delegates to sessionService, records the payment, and notifies the student', async () => {
    paymentRepo.findByWompiId.mockResolvedValue(null);
    sessionService.bookPaidSession.mockResolvedValue({ id: 'sess_abc', tutorId: 99 });
    paymentRepo.create.mockResolvedValue({ id: 'pay_1', amount: 50000 });

    const result = await wompiService.processSuccessfulPayment(baseTransaction());

    // 1. dedup was checked
    expect(paymentRepo.findByWompiId).toHaveBeenCalledWith('wompi-txn-1');

    // 2. delegated to session service with coerced ids and parsed attachments
    expect(sessionService.bookPaidSession).toHaveBeenCalledTimes(1);
    const bookArgs = sessionService.bookPaidSession.mock.calls[0][0];
    expect(bookArgs).toMatchObject({
      studentId: 42,
      tutorId: 99,
      courseId: 'course-uuid',
      sessionType: 'Individual',
      locationType: 'Virtual',
      topicsToReview: 'Derivadas',
    });
    expect(bookArgs.startTimestamp).toBeInstanceOf(Date);
    expect(bookArgs.endTimestamp).toBeInstanceOf(Date);
    expect(bookArgs.attachments).toHaveLength(1);

    // 3. payment was recorded linked to the created session, in pesos
    expect(paymentRepo.create).toHaveBeenCalledWith({
      sessionId: 'sess_abc',
      studentId: 42,
      tutorId: 99,
      amount: 50000,
      status: 'pending',
      wompiId: 'wompi-txn-1',
    });

    // 4. payment-confirmed notification only (session lifecycle is owned by sessionService)
    expect(notificationService.notifyPaymentConfirmed).toHaveBeenCalledWith(42, {
      id: 'sess_abc',
      tutorId: 99,
    });

    expect(result).toEqual({
      payment: { id: 'pay_1', amount: 50000 },
      session: { id: 'sess_abc', tutorId: 99 },
      message: 'Payment processed successfully',
    });
  });
});

describe('processSuccessfulPayment — deduplication', () => {
  it('returns early without creating anything if the wompi txn was already processed', async () => {
    paymentRepo.findByWompiId.mockResolvedValue({ id: 'pay_existing', wompiId: 'wompi-txn-1' });

    const result = await wompiService.processSuccessfulPayment(baseTransaction());

    expect(sessionService.bookPaidSession).not.toHaveBeenCalled();
    expect(paymentRepo.create).not.toHaveBeenCalled();
    expect(notificationService.notifyPaymentConfirmed).not.toHaveBeenCalled();
    expect(result).toEqual({
      payment: { id: 'pay_existing', wompiId: 'wompi-txn-1' },
      session: null,
      message: 'Payment already processed',
    });
  });
});

describe('processSuccessfulPayment — validation', () => {
  it('throws when metadata is missing required fields', async () => {
    paymentRepo.findByWompiId.mockResolvedValue(null);

    await expect(
      wompiService.processSuccessfulPayment(
        baseTransaction({ metadata: { studentId: '1', tutorId: '2' } }),
      ),
    ).rejects.toThrow(/Invalid metadata/);

    expect(sessionService.bookPaidSession).not.toHaveBeenCalled();
  });

  it('tolerates malformed attachments JSON by falling back to empty list', async () => {
    paymentRepo.findByWompiId.mockResolvedValue(null);
    sessionService.bookPaidSession.mockResolvedValue({ id: 'sess_abc', tutorId: 99 });
    paymentRepo.create.mockResolvedValue({ id: 'pay_1' });

    const tx = baseTransaction();
    tx.metadata.attachments = '{not json';

    await wompiService.processSuccessfulPayment(tx);

    const bookArgs = sessionService.bookPaidSession.mock.calls[0][0];
    expect(bookArgs.attachments).toEqual([]);
  });
});

describe('processSuccessfulPayment — error propagation', () => {
  it('rethrows SESSION_CONFLICT with wompiTransactionId attached and does NOT record a payment', async () => {
    paymentRepo.findByWompiId.mockResolvedValue(null);
    const conflict = new Error('Slot taken');
    conflict.code = 'SESSION_CONFLICT';
    sessionService.bookPaidSession.mockRejectedValue(conflict);

    await expect(
      wompiService.processSuccessfulPayment(baseTransaction()),
    ).rejects.toMatchObject({
      code: 'SESSION_CONFLICT',
      wompiTransactionId: 'wompi-txn-1',
    });

    expect(paymentRepo.create).not.toHaveBeenCalled();
    expect(notificationService.notifyPaymentConfirmed).not.toHaveBeenCalled();
  });
});
