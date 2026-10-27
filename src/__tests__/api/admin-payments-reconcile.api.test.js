/**
 * @jest-environment node
 *
 * POST /api/admin/payments/reconcile — guard, validation, service error
 * mapping and audit trail.
 */

jest.mock('@/lib/auth/guards', () => ({ requireAdminUser: jest.fn() }));
jest.mock('@/lib/services/payment-reconcile.service', () => ({ reconcileTransaction: jest.fn() }));
jest.mock('@/lib/services/admin-audit.service', () => ({
  logAction: jest.fn(),
  ADMIN_ACTIONS: { PAYMENT_RECONCILE: 'PAYMENT_RECONCILE' },
}));

const { NextResponse } = require('next/server');
const { requireAdminUser } = require('@/lib/auth/guards');
const reconcileService = require('@/lib/services/payment-reconcile.service');
const { logAction } = require('@/lib/services/admin-audit.service');
const { POST } = require('@/app/api/admin/payments/reconcile/route');

function req(body) {
  return new Request('http://localhost/api/admin/payments/reconcile', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  requireAdminUser.mockResolvedValue({ sub: 'admin-1', role: 'ADMIN' });
  logAction.mockResolvedValue(null);
});

it('refuses non-admins before touching the service', async () => {
  requireAdminUser.mockResolvedValue(NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 }));
  const res = await POST(req({ transactionId: 'x' }));
  expect(res.status).toBe(403);
  expect(reconcileService.reconcileTransaction).not.toHaveBeenCalled();
});

it('requires a transactionId or a reference', async () => {
  expect((await POST(req({}))).status).toBe(422);
  expect((await POST(req())).status).toBe(422);
  expect(reconcileService.reconcileTransaction).not.toHaveBeenCalled();
});

it('replays the transaction, answers the outcome and audits it', async () => {
  reconcileService.reconcileTransaction.mockResolvedValue({
    outcome: 'FULFILLED', transactionId: 'tx-1', reference: 'TXN-1', status: 'APPROVED',
    amountInCents: 4500000, sessionId: 'sess-1', paymentId: 'pay-1', registrationId: null,
  });

  const res = await POST(req({ transactionId: 'tx-1' }));
  const body = await res.json();

  expect(res.status).toBe(200);
  expect(body).toMatchObject({ success: true, result: { outcome: 'FULFILLED', sessionId: 'sess-1' } });
  expect(reconcileService.reconcileTransaction).toHaveBeenCalledWith({ transactionId: 'tx-1' });
  expect(logAction).toHaveBeenCalledWith(expect.objectContaining({
    adminId: 'admin-1',
    action: 'PAYMENT_RECONCILE',
    targetType: 'PaymentIntent',
    targetId: 'TXN-1',
    payload: expect.objectContaining({ outcome: 'FULFILLED', transactionId: 'tx-1', sessionId: 'sess-1' }),
  }));
});

it.each([
  ['TRANSACTION_NOT_FOUND', 404],
  ['NO_PENDING_TRANSACTION', 404],
  ['INTENT_NOT_FOUND', 404],
  ['PROVIDER_UNAVAILABLE', 503],
  ['AMOUNT_MISMATCH', 409],
  ['SESSION_CONFLICT', 409],
  ['INTENT_CONSUMED', 409],
])('maps %s to HTTP %i without auditing', async (code, status) => {
  reconcileService.reconcileTransaction.mockRejectedValue(Object.assign(new Error(code), { code }));

  const res = await POST(req({ reference: 'TXN-1' }));

  expect(res.status).toBe(status);
  expect(await res.json()).toMatchObject({ success: false, error: code });
  expect(logAction).not.toHaveBeenCalled();
});

it('an unexpected error answers 500', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  reconcileService.reconcileTransaction.mockRejectedValue(new Error('boom'));
  const res = await POST(req({ transactionId: 'tx-1' }));
  expect(res.status).toBe(500);
  console.error.mockRestore();
});
