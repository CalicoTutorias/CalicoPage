import { authFetch, publicFetch } from '@/app/services/authFetch';
import { EventService } from '@/app/services/core/EventService';

jest.mock('@/app/services/authFetch', () => ({
  authFetch: jest.fn(),
  publicFetch: jest.fn(),
}));

const body = (call) => JSON.parse(call[1].body);

describe('EventService', () => {
  beforeEach(() => jest.clearAllMocks());

  test('listPublic uses publicFetch GET /api/events', async () => {
    publicFetch.mockResolvedValue({ ok: true, status: 200, data: { success: true, events: [{ id: 1 }] } });
    const res = await EventService.listPublic();
    expect(publicFetch).toHaveBeenCalledWith('/api/events');
    expect(authFetch).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true, events: [{ id: 1 }] });
  });

  test('getBySlug uses authFetch and returns event + myRegistration', async () => {
    authFetch.mockResolvedValue({
      ok: true, status: 200, data: { success: true, event: { slug: 'a b' }, myRegistration: { id: 'r' } },
    });
    const res = await EventService.getBySlug('a b');
    expect(authFetch).toHaveBeenCalledWith('/api/events/a%20b');
    expect(res).toEqual({ success: true, event: { slug: 'a b' }, myRegistration: { id: 'r' } });
  });

  test('register posts source and marketingOptIn', async () => {
    authFetch.mockResolvedValue({ ok: true, status: 200, data: { success: true, registration: { id: 'r' } } });
    const res = await EventService.register('x', { source: 'popup', marketingOptIn: true });
    const call = authFetch.mock.calls[0];
    expect(call[0]).toBe('/api/events/x/register');
    expect(call[1].method).toBe('POST');
    expect(body(call)).toEqual({ source: 'popup', marketingOptIn: true });
    expect(res).toEqual({ success: true, registration: { id: 'r' } });
  });

  test('startCheckout posts to checkout', async () => {
    authFetch.mockResolvedValue({ ok: true, status: 200, data: { success: true, checkout: { reference: 'r' } } });
    const res = await EventService.startCheckout('x', { source: 'page', marketingOptIn: false });
    const call = authFetch.mock.calls[0];
    expect(call[0]).toBe('/api/events/x/checkout');
    expect(body(call)).toEqual({ source: 'page', marketingOptIn: false });
    expect(res.checkout).toEqual({ reference: 'r' });
  });

  test('confirmPayment wraps the transaction id', async () => {
    authFetch.mockResolvedValue({ ok: true, status: 200, data: { success: true, result: { ok: 1 } } });
    const res = await EventService.confirmPayment({ reference: 'ref', transactionId: 't1' });
    const call = authFetch.mock.calls[0];
    expect(call[0]).toBe('/api/payments/confirm-payment');
    expect(call[1].method).toBe('POST');
    expect(body(call)).toEqual({ reference: 'ref', transactionData: { id: 't1' } });
    expect(res).toEqual({ success: true, result: { ok: 1 } });
  });

  test('cancelRegistration posts refund method', async () => {
    authFetch.mockResolvedValue({ ok: true, status: 200, data: { success: true, refundable: true } });
    const res = await EventService.cancelRegistration('x', { refundMethod: 'NEQUI', refundMethodDetails: '300' });
    const call = authFetch.mock.calls[0];
    expect(call[0]).toBe('/api/events/x/cancel-registration');
    expect(body(call)).toEqual({ refundMethod: 'NEQUI', refundMethodDetails: '300' });
    expect(res).toEqual({ success: true, refundable: true });
  });

  test('submitSurvey posts payload', async () => {
    authFetch.mockResolvedValue({ ok: true, status: 200, data: { success: true } });
    const res = await EventService.submitSurvey('x', { rating: 5 });
    const call = authFetch.mock.calls[0];
    expect(call[0]).toBe('/api/events/x/survey');
    expect(body(call)).toEqual({ rating: 5 });
    expect(res.success).toBe(true);
  });

  test('getMyEvents, getPendingFeedback, getTutorEvents hit their URLs', async () => {
    authFetch.mockResolvedValueOnce({ ok: true, status: 200, data: { success: true, registrations: [1] } });
    authFetch.mockResolvedValueOnce({ ok: true, status: 200, data: { success: true, item: { a: 1 } } });
    authFetch.mockResolvedValueOnce({ ok: true, status: 200, data: { success: true, events: [2] } });
    expect(await EventService.getMyEvents()).toEqual({ success: true, registrations: [1] });
    expect(await EventService.getPendingFeedback()).toEqual({ success: true, item: { a: 1 } });
    expect(await EventService.getTutorEvents()).toEqual({ success: true, events: [2] });
    expect(authFetch.mock.calls.map((c) => c[0])).toEqual([
      '/api/me/events', '/api/me/pending-feedback', '/api/tutor/events',
    ]);
  });

  test('a 409 returns the error code and status', async () => {
    authFetch.mockResolvedValue({
      ok: false, status: 409, data: { success: false, error: 'ALREADY_REGISTERED' },
    });
    const res = await EventService.register('x', {});
    expect(res).toMatchObject({ success: false, error: 'ALREADY_REGISTERED', status: 409 });
  });

  test('a network failure returns success false', async () => {
    authFetch.mockResolvedValue({ ok: false, status: 0, data: null });
    const res = await EventService.getMyEvents();
    expect(res.success).toBe(false);
    publicFetch.mockResolvedValue({ ok: false, status: 0, data: null });
    expect((await EventService.listPublic()).success).toBe(false);
  });
});
