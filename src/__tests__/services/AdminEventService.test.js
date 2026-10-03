import { authFetch } from '@/app/services/authFetch';
import { AdminEventService } from '@/app/services/core/AdminEventService';

jest.mock('@/app/services/authFetch', () => ({
  authFetch: jest.fn(),
  authFetchBlob: jest.fn(),
}));

describe('AdminEventService', () => {
  beforeEach(() => jest.clearAllMocks());

  test('list passes the filter', async () => {
    authFetch.mockResolvedValue({ ok: true, status: 200, data: { success: true, events: [] } });
    const res = await AdminEventService.list('upcoming');
    expect(authFetch).toHaveBeenCalledWith('/api/admin/events?filter=upcoming');
    expect(res).toEqual({ success: true, events: [] });
  });

  test('create posts the payload', async () => {
    authFetch.mockResolvedValue({ ok: true, status: 201, data: { success: true, event: { id: 'e' } } });
    const res = await AdminEventService.create({ title: 'T' });
    const call = authFetch.mock.calls[0];
    expect(call[0]).toBe('/api/admin/events');
    expect(call[1].method).toBe('POST');
    expect(JSON.parse(call[1].body)).toEqual({ title: 'T' });
    expect(res.event).toEqual({ id: 'e' });
  });

  test('publish posts to /publish', async () => {
    authFetch.mockResolvedValue({ ok: true, status: 200, data: { success: true } });
    await AdminEventService.publish('e1');
    expect(authFetch.mock.calls[0][0]).toBe('/api/admin/events/e1/publish');
    expect(authFetch.mock.calls[0][1].method).toBe('POST');
  });

  test('markRefunded posts to the payment refunded URL', async () => {
    authFetch.mockResolvedValue({ ok: true, status: 200, data: { success: true } });
    await AdminEventService.markRefunded('e1', 'p1');
    expect(authFetch.mock.calls[0][0]).toBe('/api/admin/events/e1/payments/p1/refunded');
    expect(authFetch.mock.calls[0][1].method).toBe('POST');
  });

  test('errors pass code, rule and field through', async () => {
    authFetch.mockResolvedValue({
      ok: false, status: 422,
      data: { success: false, error: 'bad', code: 'VALIDATION', rule: 'R1', field: 'startsAt' },
    });
    const res = await AdminEventService.update('e1', {});
    expect(res).toMatchObject({
      success: false, error: 'bad', code: 'VALIDATION', rule: 'R1', field: 'startsAt', status: 422,
    });
  });

  test('payload fields pass through', async () => {
    const ok = (data) => authFetch.mockResolvedValueOnce({ ok: true, status: 200, data: { success: true, ...data } });
    ok({ results: [1] });
    expect(await AdminEventService.survey('e1')).toEqual({ success: true, results: [1] });
    ok({ payments: [2], totals: { a: 1 } });
    expect(await AdminEventService.payments('e1')).toEqual({ success: true, payments: [2], totals: { a: 1 } });
    ok({ sent: 3, failed: 1, skipped: 2 });
    expect(await AdminEventService.surveyReminder('e1')).toEqual({ success: true, sent: 3, failed: 1, skipped: 2 });
    ok({ sent: 3, failed: 1 });
    expect(await AdminEventService.remind('e1')).toEqual({ success: true, sent: 3, failed: 1 });
    ok({ payment: { id: 'p1' } });
    expect(await AdminEventService.markRefunded('e1', 'p1')).toEqual({ success: true, payment: { id: 'p1' } });
    ok({ event: { id: 'e1' }, calendarWarning: 'w' });
    expect(await AdminEventService.update('e1', {})).toEqual({ success: true, event: { id: 'e1' }, calendarWarning: 'w' });
    ok({ event: { id: 'e1' }, calendarWarning: 'w' });
    expect(await AdminEventService.get('e1')).toEqual({ success: true, event: { id: 'e1' }, calendarWarning: 'w' });
  });
});
