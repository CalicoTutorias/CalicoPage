/**
 * @jest-environment node
 *
 * Integration-style flow tests:
 *   POST /api/payments/create-intent -> POST /api/payments/confirm-payment
 */

jest.mock('@/lib/services/wompi.service', () => ({
  createPaymentIntent: jest.fn(),
  processSuccessfulPayment: jest.fn(),
}));

jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
}));

const wompiService = require('@/lib/services/wompi.service');
const { authenticateRequest } = require('@/lib/auth/middleware');
const createIntentRoute = require('@/app/api/payments/create-intent/route');
const confirmPaymentRoute = require('@/app/api/payments/confirm-payment/route');

function buildCreateIntentRequest(body) {
  return new Request('http://localhost/api/payments/create-intent', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-token',
    },
    body: JSON.stringify(body),
  });
}

function buildConfirmRequest(body) {
  return new Request('http://localhost/api/payments/confirm-payment', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-token',
    },
    body: JSON.stringify(body),
  });
}

const createIntentPayload = {
  studentId: '2',
  tutorId: '3',
  courseId: '9920655c-901b-4d46-873c-7a8470d1e5fc',
  amount: 50000,
  durationMinutes: 60,
  startTimestamp: '2026-05-03T13:10:00.000Z',
  endTimestamp: '2026-05-03T14:10:00.000Z',
  topicsToReview: 'Integrales y derivadas',
  attachments: [],
};

const mockedIntent = {
  id: 'intent_TXN-1',
  reference: 'TXN-1',
  public_key: 'pub_test_123',
  signature: 'sig_123',
  amountInCents: 5000000,
  checkoutUrl: 'https://checkout.wompi.co/widget.js?ref=TXN-1',
  metadata: {
    studentId: '2',
    tutorId: '3',
    courseId: '9920655c-901b-4d46-873c-7a8470d1e5fc',
    durationMinutes: 60,
    startTimestamp: '2026-05-03T13:10:00.000Z',
    endTimestamp: '2026-05-03T14:10:00.000Z',
    topicsToReview: 'Integrales y derivadas',
    attachments: '[]',
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
});

describe('Payments flow integration: create-intent -> confirm-payment', () => {
  it('APPROVED: crea intent y luego confirma pago exitoso (procesa payment+session)', async () => {
    authenticateRequest.mockReturnValue({ sub: '2' });
    wompiService.createPaymentIntent.mockResolvedValue(mockedIntent);
    wompiService.processSuccessfulPayment.mockResolvedValue({
      payment: { id: 'pay_1', status: 'pending', amount: 50000 },
      session: { id: 'sess_1' },
    });

    const intentResponse = await createIntentRoute.POST(
      buildCreateIntentRequest(createIntentPayload),
    );
    const intentBody = await intentResponse.json();

    expect(intentResponse.status).toBe(200);
    expect(intentBody.success).toBe(true);
    expect(intentBody.intent.reference).toBe('TXN-1');
    expect(wompiService.createPaymentIntent).toHaveBeenCalledTimes(1);

    const confirmBody = {
      reference: intentBody.intent.reference,
      transactionData: {
        id: 'wompi_txn_approved_1',
        reference: intentBody.intent.reference,
        status: 'APPROVED',
        amount_in_cents: intentBody.intent.amountInCents,
        metadata: intentBody.intent.metadata,
      },
    };

    const confirmResponse = await confirmPaymentRoute.POST(buildConfirmRequest(confirmBody));
    const confirmResponseBody = await confirmResponse.json();

    expect(confirmResponse.status).toBe(200);
    expect(confirmResponseBody.success).toBe(true);
    expect(confirmResponseBody.message).toBe('Pago exitoso');
    expect(wompiService.processSuccessfulPayment).toHaveBeenCalledTimes(1);
  });

  it('ERROR: aunque exista intent, no procesa confirmacion ni crea session/payment', async () => {
    authenticateRequest.mockReturnValue({ sub: '2' });
    wompiService.createPaymentIntent.mockResolvedValue(mockedIntent);

    const intentResponse = await createIntentRoute.POST(
      buildCreateIntentRequest(createIntentPayload),
    );
    const intentBody = await intentResponse.json();

    expect(intentResponse.status).toBe(200);
    expect(intentBody.success).toBe(true);

    const confirmBody = {
      reference: intentBody.intent.reference,
      transactionData: {
        id: 'wompi_txn_error_1',
        reference: intentBody.intent.reference,
        status: 'ERROR',
        amount_in_cents: intentBody.intent.amountInCents,
        metadata: intentBody.intent.metadata,
      },
    };

    const confirmResponse = await confirmPaymentRoute.POST(buildConfirmRequest(confirmBody));
    const confirmResponseBody = await confirmResponse.json();

    expect(confirmResponse.status).toBe(400);
    expect(confirmResponseBody.success).toBe(false);
    expect(confirmResponseBody.error).toBe('Error procesando el pago, intenta nuevamente');
    expect(wompiService.processSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('DECLINED: aunque exista intent, no procesa confirmacion ni crea session/payment', async () => {
    authenticateRequest.mockReturnValue({ sub: '2' });
    wompiService.createPaymentIntent.mockResolvedValue(mockedIntent);

    const intentResponse = await createIntentRoute.POST(
      buildCreateIntentRequest(createIntentPayload),
    );
    const intentBody = await intentResponse.json();

    expect(intentResponse.status).toBe(200);
    expect(intentBody.success).toBe(true);

    const confirmBody = {
      reference: intentBody.intent.reference,
      transactionData: {
        id: 'wompi_txn_declined_1',
        reference: intentBody.intent.reference,
        status: 'DECLINED',
        amount_in_cents: intentBody.intent.amountInCents,
        metadata: intentBody.intent.metadata,
      },
    };

    const confirmResponse = await confirmPaymentRoute.POST(buildConfirmRequest(confirmBody));
    const confirmResponseBody = await confirmResponse.json();

    expect(confirmResponse.status).toBe(400);
    expect(confirmResponseBody.success).toBe(false);
    expect(confirmResponseBody.error).toBe('Pago rechazado (fondos insuficientes u otro motivo)');
    expect(wompiService.processSuccessfulPayment).not.toHaveBeenCalled();
  });
});
