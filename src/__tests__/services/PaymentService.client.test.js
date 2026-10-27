/**
 * Frontend PaymentService.confirmWompiPayment — the retry/lock contract that
 * keeps a student from paying twice when Wompi is unreachable.
 */

jest.mock('@/app/services/authFetch', () => ({ authFetch: jest.fn() }));

const { authFetch } = require('@/app/services/authFetch');
const { PaymentService } = require('@/app/services/core/PaymentService');

const noSleep = { retryDelayMs: 0, sleep: async () => {} };
const INPUT = { reference: 'TXN-1', transactionId: 'wompi-1' };

beforeEach(() => jest.clearAllMocks());

it('sends only the transaction id and resolves with the server result', async () => {
  authFetch.mockResolvedValue({ ok: true, status: 200, data: { success: true, result: { session: { id: 's1' } } } });

  const result = await PaymentService.confirmWompiPayment(INPUT, noSleep);

  expect(result).toEqual({ session: { id: 's1' } });
  expect(authFetch).toHaveBeenCalledTimes(1);
  const [url, options] = authFetch.mock.calls[0];
  expect(url).toMatch(/\/api\/payments\/confirm-payment$/);
  expect(JSON.parse(options.body)).toEqual({ reference: 'TXN-1', transactionData: { id: 'wompi-1' } });
});

it('retries a retryable 503 (Wompi down) and succeeds when the server recovers', async () => {
  authFetch
    .mockResolvedValueOnce({ ok: false, status: 503, data: { success: false, error: 'PROVIDER_UNAVAILABLE', retryable: true } })
    .mockResolvedValueOnce({ ok: false, status: 0, data: null })
    .mockResolvedValueOnce({ ok: true, status: 200, data: { success: true, result: { session: { id: 's1' } } } });

  const result = await PaymentService.confirmWompiPayment(INPUT, { attempts: 4, ...noSleep });

  expect(result).toEqual({ session: { id: 's1' } });
  expect(authFetch).toHaveBeenCalledTimes(3);
});

it('after exhausting the attempts rejects with retryable=true so the form stays locked', async () => {
  authFetch.mockResolvedValue({ ok: false, status: 503, data: { success: false, error: 'PROVIDER_UNAVAILABLE', retryable: true, message: 'proveedor caído' } });

  await expect(PaymentService.confirmWompiPayment(INPUT, { attempts: 3, ...noSleep })).rejects.toMatchObject({
    code: 'PROVIDER_UNAVAILABLE', status: 503, retryable: true, message: 'proveedor caído',
  });
  expect(authFetch).toHaveBeenCalledTimes(3);
});

it('does not retry a definitive refusal (declined, refused, forbidden)', async () => {
  authFetch.mockResolvedValue({ ok: false, status: 409, data: { success: false, error: 'INTENT_CONSUMED', message: 'ya registrado' } });

  await expect(PaymentService.confirmWompiPayment(INPUT, noSleep)).rejects.toMatchObject({
    code: 'INTENT_CONSUMED', status: 409, retryable: false,
  });
  expect(authFetch).toHaveBeenCalledTimes(1);
});
