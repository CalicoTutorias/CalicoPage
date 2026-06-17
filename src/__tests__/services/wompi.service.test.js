/**
 * Unit tests for wompi.service
 *
 * Business rules under test:
 *   createPaymentIntent       → builds intent + signature; refuses missing config / bad amount
 *   verifyWebhookSignature    → HMAC-SHA256 of raw body using INTEGRITY secret
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
jest.mock('@/lib/repositories/payment-intent.repository', () => ({
  create: jest.fn(),
  findByReference: jest.fn(),
  markConsumed: jest.fn(),
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

const crypto = require('crypto');
const paymentRepo = require('@/lib/repositories/payment.repository');
const paymentIntentRepo = require('@/lib/repositories/payment-intent.repository');
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
  paymentIntentRepo.create.mockResolvedValue({ id: 'intent-row-1' });
  paymentIntentRepo.findByReference.mockResolvedValue(null);
  paymentIntentRepo.markConsumed.mockResolvedValue(undefined);

  // Wompi config for tests — the service reads these every time a function runs.
  process.env.WOMPI_PUBLIC_KEY = 'pub_test_xyz';
  process.env.WOMPI_PRIVATE_KEY = 'pub_test_xyz';
  process.env.WOMPI_INTEGRITY_SECRET = 'integrity_secret_for_tests';
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
});

// ─── createPaymentIntent ────────────────────────────────────────────────────

describe('createPaymentIntent — happy path', () => {
  const baseInput = {
    studentId: '42',
    tutorId: '99',
    courseId: 'course-uuid',
    amount: 50000, // 50,000 COP
    durationMinutes: 60,
    startTimestamp: new Date('2026-04-15T15:00:00.000Z'),
    endTimestamp: new Date('2026-04-15T16:00:00.000Z'),
    redirectUrl: 'http://localhost:3000/payments/confirm',
    topicsToReview: 'Derivadas',
    attachments: [{ s3Key: 'k', fileName: 'notes.pdf', fileSize: 1, mimeType: 'application/pdf' }],
  };

  it('returns the public key, reference, amounts and a SHA-256 integrity signature', async () => {
    const intent = await wompiService.createPaymentIntent(baseInput);

    expect(intent.public_key).toBe('pub_test_xyz');
    expect(intent.amount).toBe(50000);
    expect(intent.amountInCents).toBe(5000000);
    expect(intent.currency).toBe('COP');
    expect(intent.reference).toMatch(/^TXN-/);
    expect(intent.checkoutUrl).toContain(intent.reference);

    // Signature MUST be HMAC-SHA256 of `${reference}${amountInCents}COP${secret}` (Wompi spec).
    const expectedSig = crypto
      .createHash('sha256')
      .update(`${intent.reference}${intent.amountInCents}COP${process.env.WOMPI_INTEGRITY_SECRET}`)
      .digest('hex');
    expect(intent.signature).toBe(expectedSig);
  });

  it('serializes attachments and timestamps in metadata for webhook reuse', async () => {
    const intent = await wompiService.createPaymentIntent(baseInput);

    expect(intent.metadata.studentId).toBe('42');
    expect(intent.metadata.tutorId).toBe('99');
    expect(intent.metadata.courseId).toBe('course-uuid');
    expect(intent.metadata.startTimestamp).toBe(baseInput.startTimestamp.toISOString());
    expect(intent.metadata.endTimestamp).toBe(baseInput.endTimestamp.toISOString());

    const parsed = JSON.parse(intent.metadata.attachments);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ s3Key: 'k', fileName: 'notes.pdf' });
  });

  it('persists the intent metadata by reference for server-side webhook recovery', async () => {
    const intent = await wompiService.createPaymentIntent(baseInput);

    expect(paymentIntentRepo.create).toHaveBeenCalledWith({
      reference: intent.reference,
      metadata: expect.objectContaining({
        studentId: '42',
        tutorId: '99',
        courseId: 'course-uuid',
        startTimestamp: baseInput.startTimestamp.toISOString(),
        endTimestamp: baseInput.endTimestamp.toISOString(),
      }),
    });
  });

  it('handles fractional COP amounts by rounding to cents', async () => {
    const intent = await wompiService.createPaymentIntent({
      ...baseInput,
      amount: 50000.456, // would be 5_000_045.6 cents
    });
    expect(intent.amountInCents).toBe(5000046);
  });

  it('emits empty attachments JSON when none provided', async () => {
    const intent = await wompiService.createPaymentIntent({ ...baseInput, attachments: undefined });
    expect(intent.metadata.attachments).toBe('[]');
  });

  it('produces a different reference each call (avoids signature collisions)', async () => {
    const a = await wompiService.createPaymentIntent(baseInput);
    const b = await wompiService.createPaymentIntent(baseInput);
    expect(a.reference).not.toBe(b.reference);
    expect(a.signature).not.toBe(b.signature);
  });
});

describe('createPaymentIntent — validation', () => {
  const baseInput = {
    studentId: '42',
    tutorId: '99',
    courseId: 'course-uuid',
    amount: 50000,
    durationMinutes: 60,
    startTimestamp: new Date('2026-04-15T15:00:00.000Z'),
    endTimestamp: new Date('2026-04-15T16:00:00.000Z'),
    redirectUrl: 'http://localhost:3000/payments/confirm',
  };

  it.each([
    ['studentId', { studentId: undefined }],
    ['tutorId', { tutorId: undefined }],
    ['courseId', { courseId: undefined }],
    ['amount', { amount: undefined }],
  ])('throws when %s is missing', async (_field, override) => {
    await expect(
      wompiService.createPaymentIntent({ ...baseInput, ...override }),
    ).rejects.toThrow(/required/i);
  });

  it('throws when amount is zero or negative', async () => {
    await expect(
      wompiService.createPaymentIntent({ ...baseInput, amount: 0 }),
    ).rejects.toThrow(/required/i); // zero is falsy → caught by "missing required"

    await expect(
      wompiService.createPaymentIntent({ ...baseInput, amount: -10 }),
    ).rejects.toThrow(/Invalid payment amount/);
  });

  it('throws when WOMPI_PUBLIC_KEY is not configured', async () => {
    delete process.env.WOMPI_PUBLIC_KEY;
    await expect(wompiService.createPaymentIntent(baseInput)).rejects.toThrow(/public key/i);
  });

  it('throws when WOMPI_INTEGRITY_SECRET is not configured', async () => {
    delete process.env.WOMPI_INTEGRITY_SECRET;
    await expect(wompiService.createPaymentIntent(baseInput)).rejects.toThrow(/INTEGRITY_SECRET/);
  });
});

// ─── verifyWebhookSignature ─────────────────────────────────────────────────

describe('verifyWebhookSignature — security boundary', () => {
  const SECRET = 'integrity_secret_for_tests';
  const body = JSON.stringify({ event: 'transaction.updated', data: { id: 'txn_1', status: 'APPROVED' } });

  function hmacOf(payload, secret = SECRET) {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  it('accepts a signature that matches HMAC-SHA256 of the raw body with the integrity secret', () => {
    const valid = hmacOf(body);
    expect(wompiService.verifyWebhookSignature(body, valid)).toBe(true);
  });

  it('rejects a tampered body (body changed after signing)', () => {
    const sigForOriginal = hmacOf(body);
    const tampered = body.replace('APPROVED', 'DECLINED');
    expect(wompiService.verifyWebhookSignature(tampered, sigForOriginal)).toBe(false);
  });

  it('rejects a signature signed with a different secret', () => {
    const wrong = hmacOf(body, 'attacker_secret');
    expect(wompiService.verifyWebhookSignature(body, wrong)).toBe(false);
  });

  it('returns false when the signature header is missing/empty', () => {
    expect(wompiService.verifyWebhookSignature(body, '')).toBe(false);
    expect(wompiService.verifyWebhookSignature(body, undefined)).toBe(false);
  });

  it('uses constant-time compare (rejects sigs of incorrect length without throwing)', () => {
    // timingSafeEqual throws if lengths differ — the service must guard against that
    // turning into a 500. Here we just assert it never throws and returns a boolean.
    expect(() => wompiService.verifyWebhookSignature(body, 'short')).not.toThrow();
    expect(typeof wompiService.verifyWebhookSignature(body, 'short')).toBe('boolean');
  });
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
    expect(paymentIntentRepo.markConsumed).toHaveBeenCalledWith('TXN-REF-1');
  });
});

describe('processSuccessfulPayment — webhook metadata recovery', () => {
  it('recovers missing webhook metadata from the persisted payment intent', async () => {
    const storedMetadata = baseTransaction().metadata;
    paymentIntentRepo.findByReference.mockResolvedValue({ metadata: storedMetadata });
    paymentRepo.findByWompiId.mockResolvedValue(null);
    sessionService.bookPaidSession.mockResolvedValue({ id: 'sess_abc', tutorId: '99' });
    paymentRepo.create.mockResolvedValue({ id: 'pay_1', amount: 50000 });

    await wompiService.processSuccessfulPayment(baseTransaction({ metadata: undefined }));

    expect(paymentIntentRepo.findByReference).toHaveBeenCalledWith('TXN-REF-1');
    expect(sessionService.bookPaidSession).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: '42',
        tutorId: '99',
        courseId: 'course-uuid',
      }),
    );
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
