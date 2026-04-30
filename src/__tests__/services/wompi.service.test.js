/**
 * Unit tests for wompi.service
 *
 * Business rules under test:
 *   APPROVED  → processSuccessfulPayment creates session + payment(pending)
 *   DECLINED  → handleFailedPayment creates nothing (no payment, no session)
 *   ERROR     → handleFailedPayment creates nothing (no payment, no session)
 *   Dedup     → second call with same wompi_id is a no-op
 */

jest.mock('@/lib/repositories/payment.repository', () => ({
  findByWompiId: jest.fn(),
  create: jest.fn(),
  incrementTutorNextPayment: jest.fn(),
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
  paymentRepo.incrementTutorNextPayment.mockResolvedValue(undefined);
});

// ─── processSuccessfulPayment — happy path ───────────────────────────────────

describe('processSuccessfulPayment — APPROVED creates session + pending payment', () => {
  it('delegates to sessionService with coerced string IDs and parsed attachments', async () => {
    paymentRepo.findByWompiId.mockResolvedValue(null);
    sessionService.bookPaidSession.mockResolvedValue({ id: 'sess_abc', tutorId: '99' });
    paymentRepo.create.mockResolvedValue({ id: 'pay_1', amount: 50000 });

    await wompiService.processSuccessfulPayment(baseTransaction());

    const bookArgs = sessionService.bookPaidSession.mock.calls[0][0];
    expect(bookArgs).toMatchObject({
      studentId: '42',
      tutorId: '99',
      courseId: 'course-uuid',
      sessionType: 'Individual',
      locationType: 'Virtual',
      topicsToReview: 'Derivadas',
    });
    expect(bookArgs.startTimestamp).toBeInstanceOf(Date);
    expect(bookArgs.endTimestamp).toBeInstanceOf(Date);
    expect(bookArgs.attachments).toHaveLength(1);
  });

  it('creates a payment with status=pending in pesos', async () => {
    paymentRepo.findByWompiId.mockResolvedValue(null);
    sessionService.bookPaidSession.mockResolvedValue({ id: 'sess_abc', tutorId: '99' });
    paymentRepo.create.mockResolvedValue({ id: 'pay_1', amount: 50000 });

    await wompiService.processSuccessfulPayment(baseTransaction());

    expect(paymentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess_abc',
        studentId: '42',
        tutorId: '99',
        amount: 50000, // 5_000_000 cents ÷ 100
        status: 'pending',
        wompiId: 'wompi-txn-1',
      }),
    );
  });

  it('notifies the student and returns payment + session', async () => {
    paymentRepo.findByWompiId.mockResolvedValue(null);
    sessionService.bookPaidSession.mockResolvedValue({ id: 'sess_abc', tutorId: '99' });
    paymentRepo.create.mockResolvedValue({ id: 'pay_1', amount: 50000 });

    const result = await wompiService.processSuccessfulPayment(baseTransaction());

    expect(notificationService.notifyPaymentConfirmed).toHaveBeenCalledWith(
      '42',
      expect.objectContaining({ id: 'sess_abc' }),
    );
    expect(result).toMatchObject({
      payment: { id: 'pay_1', amount: 50000 },
      session: { id: 'sess_abc' },
      message: 'Payment processed successfully',
    });
  });
});

// ─── processSuccessfulPayment — deduplication ────────────────────────────────

describe('processSuccessfulPayment — deduplication', () => {
  it('returns early without creating anything if the wompi txn was already processed', async () => {
    paymentRepo.findByWompiId.mockResolvedValue({ id: 'pay_existing', wompiId: 'wompi-txn-1' });

    const result = await wompiService.processSuccessfulPayment(baseTransaction());

    expect(sessionService.bookPaidSession).not.toHaveBeenCalled();
    expect(paymentRepo.create).not.toHaveBeenCalled();
    expect(notificationService.notifyPaymentConfirmed).not.toHaveBeenCalled();
    expect(result.message).toBe('Payment already processed');
  });
});

// ─── processSuccessfulPayment — validation ───────────────────────────────────

describe('processSuccessfulPayment — validation', () => {
  it('throws when metadata is missing required fields', async () => {
    paymentRepo.findByWompiId.mockResolvedValue(null);

    await expect(
      wompiService.processSuccessfulPayment(
        baseTransaction({ metadata: { studentId: '1', tutorId: '2' } }),
      ),
    ).rejects.toThrow(/Invalid metadata/);

    expect(sessionService.bookPaidSession).not.toHaveBeenCalled();
    expect(paymentRepo.create).not.toHaveBeenCalled();
  });

  it('tolerates malformed attachments JSON by falling back to empty list', async () => {
    paymentRepo.findByWompiId.mockResolvedValue(null);
    sessionService.bookPaidSession.mockResolvedValue({ id: 'sess_abc', tutorId: '99' });
    paymentRepo.create.mockResolvedValue({ id: 'pay_1' });

    const tx = baseTransaction();
    tx.metadata.attachments = '{not json';

    await wompiService.processSuccessfulPayment(tx);

    const bookArgs = sessionService.bookPaidSession.mock.calls[0][0];
    expect(bookArgs.attachments).toEqual([]);
  });
});

// ─── processSuccessfulPayment — error propagation ───────────────────────────

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

// ─── handleFailedPayment — DECLINED ─────────────────────────────────────────

describe('handleFailedPayment — DECLINED', () => {
  it('does NOT create a payment record', async () => {
    await wompiService.handleFailedPayment({
      wompiTransactionId: 'wompi-declined-1',
      reference: 'REF-DEC-1',
      reason: 'DECLINED',
      studentId: '42',
    });

    expect(paymentRepo.create).not.toHaveBeenCalled();
    expect(sessionService.bookPaidSession).not.toHaveBeenCalled();
  });

  it('does NOT create a session', async () => {
    await wompiService.handleFailedPayment({
      wompiTransactionId: 'wompi-declined-1',
      reference: 'REF-DEC-1',
      reason: 'DECLINED',
      studentId: '42',
    });

    expect(sessionService.bookPaidSession).not.toHaveBeenCalled();
  });

  it('notifies the student of the failure', async () => {
    await wompiService.handleFailedPayment({
      wompiTransactionId: 'wompi-declined-1',
      reference: 'REF-DEC-1',
      reason: 'DECLINED',
      studentId: '42',
    });

    expect(notificationService.notifyPaymentFailed).toHaveBeenCalledWith('42', 'REF-DEC-1');
  });
});

// ─── handleFailedPayment — ERROR ─────────────────────────────────────────────

describe('handleFailedPayment — ERROR', () => {
  it('does NOT create a payment record', async () => {
    await wompiService.handleFailedPayment({
      wompiTransactionId: 'wompi-error-1',
      reference: 'REF-ERR-1',
      reason: 'ERROR',
      studentId: '42',
    });

    expect(paymentRepo.create).not.toHaveBeenCalled();
    expect(sessionService.bookPaidSession).not.toHaveBeenCalled();
  });

  it('does NOT create a session', async () => {
    await wompiService.handleFailedPayment({
      wompiTransactionId: 'wompi-error-1',
      reference: 'REF-ERR-1',
      reason: 'ERROR',
      studentId: '42',
    });

    expect(sessionService.bookPaidSession).not.toHaveBeenCalled();
  });

  it('notifies the student even on ERROR', async () => {
    await wompiService.handleFailedPayment({
      wompiTransactionId: 'wompi-error-1',
      reference: 'REF-ERR-1',
      reason: 'ERROR',
      studentId: '42',
    });

    expect(notificationService.notifyPaymentFailed).toHaveBeenCalledWith('42', 'REF-ERR-1');
  });

  it('does not throw when studentId is missing', async () => {
    await expect(
      wompiService.handleFailedPayment({
        wompiTransactionId: 'txn-no-student',
        reference: 'REF-NOSID',
        reason: 'ERROR',
      }),
    ).resolves.toBeUndefined();

    expect(paymentRepo.create).not.toHaveBeenCalled();
    expect(notificationService.notifyPaymentFailed).not.toHaveBeenCalled();
  });
});
