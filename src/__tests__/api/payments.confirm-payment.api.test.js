/**
 * @jest-environment node
 *
 * Integration-style tests for POST /api/payments/confirm-payment.
 *
 * The route no longer trusts the client-supplied transactionData beyond the
 * Wompi transaction id: status/amount/metadata are re-fetched from Wompi
 * (wompi-api.service.fetchTransaction) before the payment is processed.
 */

jest.mock('@/lib/services/wompi.service', () => ({
  processSuccessfulPayment: jest.fn(),
}));

jest.mock('@/lib/services/wompi-api.service', () => ({
  fetchTransaction: jest.fn(),
}));

jest.mock('@/lib/repositories/payment-intent.repository', () => ({
  findByReference: jest.fn(),
}));

jest.mock('@/lib/payments/pricing', () => ({
  resolveSessionAmount: jest.fn(),
}));

jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
}));

const { NextResponse } = require('next/server');
const wompiService = require('@/lib/services/wompi.service');
const wompiApi = require('@/lib/services/wompi-api.service');
const paymentIntentRepo = require('@/lib/repositories/payment-intent.repository');
const { resolveSessionAmount } = require('@/lib/payments/pricing');
const { authenticateRequest } = require('@/lib/auth/middleware');
const route = require('@/app/api/payments/confirm-payment/route');

function buildRequest(body, auth = true) {
  const headers = {
    'content-type': 'application/json',
  };
  if (auth) headers.authorization = 'Bearer test-token';

  return new Request('http://localhost/api/payments/confirm-payment', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function requestBody(overrides = {}) {
  return {
    reference: 'TXN-1',
    transactionData: { id: 'wompi-1' },
    ...overrides,
  };
}

function wompiTransaction(overrides = {}) {
  return {
    id: 'wompi-1',
    status: 'APPROVED',
    amount_in_cents: 5000000,
    reference: 'TXN-1',
    metadata: {
      studentId: '2',
      tutorId: '3',
      courseId: 'course-uuid',
      startTimestamp: '2026-05-03T13:10:00.000Z',
      endTimestamp: '2026-05-03T14:10:00.000Z',
      topicsToReview: 'Integrales',
      attachments: '[]',
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // No price reconciliation mismatch by default — amount stays untouched.
  resolveSessionAmount.mockResolvedValue({ amount: 50000, pricePerHour: 50000, hours: 1 });
});

describe('POST /api/payments/confirm-payment', () => {
  it('APPROVED: re-fetches the transaction from Wompi and processes the payment', async () => {
    authenticateRequest.mockResolvedValue({ sub: '2' });
    wompiApi.fetchTransaction.mockResolvedValue(wompiTransaction());
    wompiService.processSuccessfulPayment.mockResolvedValue({
      payment: { id: 'pay_1', status: 'pending' },
      session: { id: 'sess_1' },
    });

    const response = await route.POST(buildRequest(requestBody()));
    const body = await response.json();

    expect(wompiApi.fetchTransaction).toHaveBeenCalledWith('wompi-1');
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Pago exitoso');
    expect(wompiService.processSuccessfulPayment).toHaveBeenCalledTimes(1);
    // The Wompi-fetched transaction (not the client body) drives processing.
    expect(wompiService.processSuccessfulPayment).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'APPROVED', id: 'wompi-1' }),
    );
  });

  it('ignora un status APPROVED forjado por el cliente si Wompi reporta ERROR', async () => {
    authenticateRequest.mockResolvedValue({ sub: '2' });
    wompiApi.fetchTransaction.mockResolvedValue(wompiTransaction({ status: 'ERROR' }));

    const response = await route.POST(
      buildRequest(requestBody({ transactionData: { id: 'wompi-1', status: 'APPROVED' } })),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Error procesando el pago, intenta nuevamente');
    expect(wompiService.processSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('DECLINED: no procesa pago ni crea sesion', async () => {
    authenticateRequest.mockResolvedValue({ sub: '2' });
    wompiApi.fetchTransaction.mockResolvedValue(wompiTransaction({ status: 'DECLINED' }));

    const response = await route.POST(buildRequest(requestBody()));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Pago rechazado (fondos insuficientes u otro motivo)');
    expect(wompiService.processSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('bloquea confirmar pago de otro estudiante', async () => {
    authenticateRequest.mockResolvedValue({ sub: '99' });
    wompiApi.fetchTransaction.mockResolvedValue(wompiTransaction());

    const response = await route.POST(buildRequest(requestBody()));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Cannot confirm payment for another student');
    expect(wompiService.processSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('recupera metadata desde PaymentIntent cuando Wompi no la devuelve', async () => {
    authenticateRequest.mockResolvedValue({ sub: '2' });
    wompiApi.fetchTransaction.mockResolvedValue(
      wompiTransaction({ metadata: {} }),
    );
    paymentIntentRepo.findByReference.mockResolvedValue({
      metadata: wompiTransaction().metadata,
    });
    wompiService.processSuccessfulPayment.mockResolvedValue({
      payment: { id: 'pay_1', status: 'pending' },
      session: { id: 'sess_1' },
    });

    const response = await route.POST(buildRequest(requestBody()));
    const body = await response.json();

    expect(paymentIntentRepo.findByReference).toHaveBeenCalledWith('TXN-1');
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('rechaza si el monto pagado no coincide con el precio esperado', async () => {
    authenticateRequest.mockResolvedValue({ sub: '2' });
    wompiApi.fetchTransaction.mockResolvedValue(wompiTransaction({ amount_in_cents: 999999 }));
    resolveSessionAmount.mockResolvedValue({ amount: 50000, pricePerHour: 50000, hours: 1 });

    const response = await route.POST(buildRequest(requestBody()));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('El monto del pago no coincide con el precio esperado');
    expect(wompiService.processSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('rechaza si no hay sesion de autenticacion', async () => {
    authenticateRequest.mockResolvedValue(
      NextResponse.json({ error: 'Missing or malformed Authorization header' }, { status: 401 }),
    );

    const response = await route.POST(buildRequest(requestBody(), false));

    expect(response.status).toBe(401);
    expect(wompiApi.fetchTransaction).not.toHaveBeenCalled();
  });
});
