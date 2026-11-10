/**
 * @jest-environment node
 *
 * GET /api/admin/payouts: admin-only, and the query is validated before it
 * reaches the service. The service is mocked (see payouts.service.test.js).
 */

jest.mock('@/lib/auth/guards', () => ({ requireAdminUser: jest.fn() }));
jest.mock('@/lib/services/payouts.service', () => ({
  listPendingPayoutsByTutor: jest.fn(),
  listPayoutPayments: jest.fn(),
}));

const { NextResponse } = require('next/server');
const { requireAdminUser } = require('@/lib/auth/guards');
const service = require('@/lib/services/payouts.service');
const { GET } = require('@/app/api/admin/payouts/route');

const request = (query = '') => new Request(`http://localhost/api/admin/payouts${query}`);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  requireAdminUser.mockResolvedValue({ sub: 'admin-1' });
  service.listPendingPayoutsByTutor.mockResolvedValue({ groups: [], totals: {} });
  service.listPayoutPayments.mockResolvedValue({ items: [], total: 0 });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /api/admin/payouts', () => {
  it.each([[401], [403]])('test_should_answer_%i_when_the_guard_refuses', async (status) => {
    requireAdminUser.mockResolvedValue(NextResponse.json({ error: 'No' }, { status }));

    const res = await GET(request('?view=flat'));

    expect(res.status).toBe(status);
    expect(service.listPayoutPayments).not.toHaveBeenCalled();
    expect(service.listPendingPayoutsByTutor).not.toHaveBeenCalled();
  });

  it('test_should_default_to_the_digest_by_tutor', async () => {
    const res = await GET(request());

    expect((await res.json()).view).toBe('byTutor');
    expect(service.listPendingPayoutsByTutor).toHaveBeenCalled();
  });

  it('test_should_default_the_detail_to_what_is_still_owed', async () => {
    await GET(request('?view=flat'));

    expect(service.listPayoutPayments).toHaveBeenCalledWith({ payout: 'pending', type: 'all', limit: 25, offset: 0 });
  });

  it('test_should_pass_the_filters_and_the_page', async () => {
    service.listPayoutPayments.mockResolvedValue({ items: [{ id: 'p1' }], total: 26 });

    const res = await GET(request('?view=flat&payout=paid&type=manual&limit=25&offset=25'));

    expect(service.listPayoutPayments).toHaveBeenCalledWith({ payout: 'paid', type: 'manual', limit: 25, offset: 25 });
    expect(await res.json()).toEqual({ success: true, view: 'flat', items: [{ id: 'p1' }], total: 26 });
  });

  it('test_should_fall_back_on_values_it_does_not_know', async () => {
    await GET(request('?view=flat&payout=everything&type=cash&limit=9999&offset=-3'));

    expect(service.listPayoutPayments).toHaveBeenCalledWith({ payout: 'pending', type: 'all', limit: 25, offset: 0 });
  });

  it('test_should_not_leak_an_unexpected_error', async () => {
    service.listPayoutPayments.mockRejectedValue(new Error('db at 10.0.0.1'));

    const res = await GET(request('?view=flat'));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Internal server error');
  });
});
