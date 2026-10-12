/**
 * @jest-environment node
 *
 * payment-external-charge.service — turning a courtesy (100 % coupon)
 * payment into the real charge Wompi collected, after verifying it.
 */

jest.mock('@/lib/services/wompi-api.service', () => ({ fetchTransaction: jest.fn() }));
jest.mock('@/lib/repositories/payment.repository', () => ({
  findById: jest.fn(),
  findBySessionId: jest.fn(),
  existsByWompiId: jest.fn(),
  recordExternalCharge: jest.fn(),
}));
jest.mock('@/lib/repositories/payment-intent.repository', () => ({ markConsumed: jest.fn() }));
jest.mock('@/lib/services/admin-audit.service', () => ({
  logAction: jest.fn(),
  ADMIN_ACTIONS: { PAYMENT_EXTERNAL_CHARGE: 'PAYMENT_EXTERNAL_CHARGE' },
}));

const wompiApi = require('@/lib/services/wompi-api.service');
const paymentRepo = require('@/lib/repositories/payment.repository');
const paymentIntentRepo = require('@/lib/repositories/payment-intent.repository');
const audit = require('@/lib/services/admin-audit.service');
const { recordExternalCharge } = require('@/lib/services/payment-external-charge.service');

const COURTESY = {
  id: 'pay-free', sessionId: 'sess-1', studentId: 'student-1', tutorId: 'tutor-1',
  amount: '0.00', originalAmount: '45000.00', discountAmount: '45000.00', tutorPayoutBase: '45000.00',
  couponId: 'coupon-free', wompiId: null, status: 'paid',
};
const CHARGED = { ...COURTESY, amount: '45000.00', discountAmount: '0.00', couponId: null, wompiId: '15113-1791597300-12345' };
const TXN = { id: '15113-1791597300-12345', status: 'APPROVED', amount_in_cents: 4500000, reference: 'TXN-1791597028334-gsgqoizoy' };
const INPUT = { paymentId: 'pay-free', wompiId: '15113-1791597300-12345', adminId: 'admin-1' };

beforeEach(() => {
  jest.clearAllMocks();
  paymentRepo.findById.mockResolvedValue(COURTESY);
  paymentRepo.findBySessionId.mockResolvedValue(COURTESY);
  paymentRepo.existsByWompiId.mockResolvedValue(false);
  paymentRepo.recordExternalCharge.mockResolvedValue({ payment: CHARGED, releasedRedemptions: 1 });
  wompiApi.fetchTransaction.mockResolvedValue(TXN);
});

it('verifies the transaction, rewrites the money, consumes the original intent and audits before/after', async () => {
  const result = await recordExternalCharge(INPUT);

  expect(wompiApi.fetchTransaction).toHaveBeenCalledWith('15113-1791597300-12345');
  expect(paymentRepo.recordExternalCharge).toHaveBeenCalledWith({ paymentId: 'pay-free', wompiId: '15113-1791597300-12345' });
  expect(paymentIntentRepo.markConsumed).toHaveBeenCalledWith('TXN-1791597028334-gsgqoizoy');
  expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
    adminId: 'admin-1',
    action: 'PAYMENT_EXTERNAL_CHARGE',
    targetType: 'Payment',
    targetId: 'pay-free',
    payload: expect.objectContaining({
      before: expect.objectContaining({ amount: 0, discountAmount: 45000, couponId: 'coupon-free', wompiId: null }),
      after: expect.objectContaining({ amount: 45000, discountAmount: 0, tutorPayoutBase: 45000, couponId: null, wompiId: '15113-1791597300-12345' }),
      releasedRedemptions: 1,
    }),
  }));
  expect(result).toMatchObject({
    payment: CHARGED,
    releasedRedemptions: 1,
    transaction: { id: '15113-1791597300-12345', status: 'APPROVED', amountInCents: 4500000, reference: 'TXN-1791597028334-gsgqoizoy' },
  });
});

it('finds the payment by session id when no payment id is given', async () => {
  await recordExternalCharge({ sessionId: 'sess-1', wompiId: TXN.id, adminId: 'admin-1' });
  expect(paymentRepo.findBySessionId).toHaveBeenCalledWith('sess-1');
  expect(paymentRepo.findById).not.toHaveBeenCalled();
});

it.each([
  ['a payment already linked to Wompi', { ...COURTESY, wompiId: 'other' }, 'ALREADY_CHARGED'],
  ['a payment that was actually charged (not courtesy)', { ...COURTESY, amount: '45000.00', discountAmount: '0.00' }, 'NOT_COURTESY'],
  ['a partial discount', { ...COURTESY, amount: '40500.00', discountAmount: '4500.00' }, 'NOT_COURTESY'],
])('refuses %s before touching Wompi', async (_label, payment, code) => {
  paymentRepo.findById.mockResolvedValue(payment);
  await expect(recordExternalCharge(INPUT)).rejects.toMatchObject({ code });
  expect(wompiApi.fetchTransaction).not.toHaveBeenCalled();
  expect(paymentRepo.recordExternalCharge).not.toHaveBeenCalled();
});

it('refuses a Wompi id already recorded on another payment', async () => {
  paymentRepo.existsByWompiId.mockResolvedValue(true);
  await expect(recordExternalCharge(INPUT)).rejects.toMatchObject({ code: 'WOMPI_ID_IN_USE' });
  expect(paymentRepo.recordExternalCharge).not.toHaveBeenCalled();
});

it('refuses a transaction that is not APPROVED or not for the list price', async () => {
  wompiApi.fetchTransaction.mockResolvedValueOnce({ ...TXN, status: 'DECLINED' });
  await expect(recordExternalCharge(INPUT)).rejects.toMatchObject({ code: 'NOT_APPROVED' });

  wompiApi.fetchTransaction.mockResolvedValueOnce({ ...TXN, amount_in_cents: 4000000 });
  await expect(recordExternalCharge(INPUT)).rejects.toMatchObject({ code: 'AMOUNT_MISMATCH', paidCents: 4000000, expectedCents: 4500000 });

  expect(paymentRepo.recordExternalCharge).not.toHaveBeenCalled();
  expect(audit.logAction).not.toHaveBeenCalled();
});

it('maps Wompi lookup failures and missing payments', async () => {
  wompiApi.fetchTransaction.mockRejectedValueOnce(Object.assign(new Error('nf'), { code: 'NOT_FOUND' }));
  await expect(recordExternalCharge(INPUT)).rejects.toMatchObject({ code: 'TRANSACTION_NOT_FOUND' });

  wompiApi.fetchTransaction.mockRejectedValueOnce(Object.assign(new Error('down'), { code: 'PROVIDER_UNAVAILABLE' }));
  await expect(recordExternalCharge(INPUT)).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE', retryable: true });

  paymentRepo.findById.mockResolvedValue(null);
  await expect(recordExternalCharge(INPUT)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(recordExternalCharge({ paymentId: 'x', wompiId: '', adminId: 'a' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
});
