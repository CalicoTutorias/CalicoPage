/**
 * @jest-environment node
 *
 * Integration-style tests for POST /api/payments/confirm-payment.
 * Validates status-driven behavior:
 * - APPROVED  -> processes payment (creates payment+session in service layer)
 * - ERROR     -> does not process payment
 * - DECLINED  -> does not process payment
 */

jest.mock('@/lib/services/wompi.service', () => ({
  processSuccessfulPayment: jest.fn(),
}));

jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
}));

const wompiService = require('@/lib/services/wompi.service');
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

function approvedBody(overrides = {}) {
  return {
    reference: 'TXN-1',
    transactionData: {
      id: 'wompi-1',
      status: 'APPROVED',
      amount_in_cents: 5000000,
      metadata: {
        studentId: '2',
        tutorId: '3',
        courseId: 'course-uuid',
        startTimestamp: '2026-05-03T13:10:00.000Z',
        endTimestamp: '2026-05-03T14:10:00.000Z',
        topicsToReview: 'Integrales',
        attachments: '[]',
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/payments/confirm-payment', () => {
  it('APPROVED: procesa pago y retorna exito', async () => {
    authenticateRequest.mockReturnValue({ sub: '2' });
    wompiService.processSuccessfulPayment.mockResolvedValue({
      payment: { id: 'pay_1', status: 'pending' },
      session: { id: 'sess_1' },
    });

    const response = await route.POST(buildRequest(approvedBody()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Pago exitoso');
    expect(wompiService.processSuccessfulPayment).toHaveBeenCalledTimes(1);
  });

  it('ERROR: no procesa pago ni crea sesion', async () => {
    authenticateRequest.mockReturnValue({ sub: '2' });

    const response = await route.POST(
      buildRequest(
        approvedBody({
          transactionData: {
            ...approvedBody().transactionData,
            status: 'ERROR',
          },
        }),
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Error procesando el pago, intenta nuevamente');
    expect(wompiService.processSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('DECLINED: no procesa pago ni crea sesion', async () => {
    authenticateRequest.mockReturnValue({ sub: '2' });

    const response = await route.POST(
      buildRequest(
        approvedBody({
          transactionData: {
            ...approvedBody().transactionData,
            status: 'DECLINED',
          },
        }),
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Pago rechazado (fondos insuficientes u otro motivo)');
    expect(wompiService.processSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('bloquea confirmar pago de otro estudiante', async () => {
    authenticateRequest.mockReturnValue({ sub: '99' });

    const response = await route.POST(buildRequest(approvedBody()));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Cannot confirm payment for another student');
    expect(wompiService.processSuccessfulPayment).not.toHaveBeenCalled();
  });
});
