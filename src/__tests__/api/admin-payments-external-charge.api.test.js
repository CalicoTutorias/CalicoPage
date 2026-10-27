/**
 * @jest-environment node
 *
 * POST /api/admin/payments/record-external-charge — guard, validation and
 * service error mapping.
 */

jest.mock('@/lib/auth/guards', () => ({ requireAdminUser: jest.fn() }));
jest.mock('@/lib/services/payment-external-charge.service', () => ({ recordExternalCharge: jest.fn() }));

const { NextResponse } = require('next/server');
const { requireAdminUser } = require('@/lib/auth/guards');
const service = require('@/lib/services/payment-external-charge.service');
const { POST } = require('@/app/api/admin/payments/record-external-charge/route');

function req(body) {
  return new Request('http://localhost/api/admin/payments/record-external-charge', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  requireAdminUser.mockResolvedValue({ sub: 'admin-1', role: 'ADMIN' });
});

it('refuses non-admins before touching the service', async () => {
  requireAdminUser.mockResolvedValue(NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 }));
  expect((await POST(req({ sessionId: 's', wompiId: 'w' }))).status).toBe(403);
  expect(service.recordExternalCharge).not.toHaveBeenCalled();
});

it('requires wompiId and a payment or session id', async () => {
  expect((await POST(req({ wompiId: 'w' }))).status).toBe(422);
  expect((await POST(req({ sessionId: 's' }))).status).toBe(422);
  expect((await POST(req())).status).toBe(422);
  expect(service.recordExternalCharge).not.toHaveBeenCalled();
});

it('passes the admin identity through and answers the service result', async () => {
  service.recordExternalCharge.mockResolvedValue({
    payment: { id: 'pay-1', amount: '45000.00' }, releasedRedemptions: 1,
    transaction: { id: 'w-1', status: 'APPROVED', amountInCents: 4500000, reference: 'TXN-1' },
  });

  const res = await POST(req({ sessionId: 'sess-1', wompiId: 'w-1' }));

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ success: true, payment: { id: 'pay-1' }, releasedRedemptions: 1, transaction: { id: 'w-1' } });
  expect(service.recordExternalCharge).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'sess-1', wompiId: 'w-1', adminId: 'admin-1' }));
});

it.each([
  ['NOT_FOUND', 404],
  ['TRANSACTION_NOT_FOUND', 404],
  ['ALREADY_CHARGED', 409],
  ['NOT_COURTESY', 409],
  ['WOMPI_ID_IN_USE', 409],
  ['NOT_APPROVED', 409],
  ['AMOUNT_MISMATCH', 409],
  ['PROVIDER_UNAVAILABLE', 503],
])('maps %s to HTTP %i', async (code, status) => {
  service.recordExternalCharge.mockRejectedValue(Object.assign(new Error(code), { code }));
  const res = await POST(req({ paymentId: 'p', wompiId: 'w' }));
  expect(res.status).toBe(status);
  expect(await res.json()).toMatchObject({ success: false, error: code });
});

it('an unexpected error answers 500', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  service.recordExternalCharge.mockRejectedValue(new Error('boom'));
  expect((await POST(req({ paymentId: 'p', wompiId: 'w' }))).status).toBe(500);
  console.error.mockRestore();
});
