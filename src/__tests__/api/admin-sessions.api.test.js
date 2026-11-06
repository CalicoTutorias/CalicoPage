/**
 * @jest-environment node
 *
 * Route concerns of the admin "Tutorías" page endpoints:
 *   GET /api/admin/sessions
 *   GET /api/admin/sessions/export
 *   GET /api/admin/payments/unbooked
 * The guard and the service are mocked: admin gating, query validation,
 * filters handed to the service, the response envelope and the 500 path.
 * The CSV body itself is covered in admin-sessions-export.api.test.js.
 */

jest.mock('@/lib/auth/guards', () => ({
  requireAdminUser: jest.fn(),
}));
jest.mock('@/lib/services/admin-sessions.service', () => ({
  listSessions: jest.fn(),
  sessionsCsv: jest.fn(),
  listUnbookedPayments: jest.fn(),
}));

const { NextResponse } = require('next/server');
const { requireAdminUser } = require('@/lib/auth/guards');
const service = require('@/lib/services/admin-sessions.service');
const { GET: listSessions } = require('@/app/api/admin/sessions/route');
const { GET: exportSessions } = require('@/app/api/admin/sessions/export/route');
const { GET: listUnbooked } = require('@/app/api/admin/payments/unbooked/route');
const { makeSessionItem, makeUnbookedItem } = require('../fixtures/admin-sessions.fixtures');

const req = (path, qs = '') => new Request(`http://localhost${path}${qs}`);

const DEFAULT_FILTERS = {
  statuses: [],
  from: null,
  to: null,
  search: '',
  upcoming: false,
  missingMeet: false,
  includeTest: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  requireAdminUser.mockResolvedValue({ sub: 'admin-1', role: 'ADMIN' });
});

describe.each([
  ['GET /api/admin/sessions', () => listSessions(req('/api/admin/sessions')), 'listSessions'],
  ['GET /api/admin/sessions/export', () => exportSessions(req('/api/admin/sessions/export')), 'sessionsCsv'],
  ['GET /api/admin/payments/unbooked', () => listUnbooked(req('/api/admin/payments/unbooked')), 'listUnbookedPayments'],
])('%s guard', (_name, call, serviceFn) => {
  it('test_should_return_403_when_caller_is_not_admin', async () => {
    const denied = NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
    requireAdminUser.mockResolvedValue(denied);

    const res = await call();

    expect(res).toBe(denied);
    expect(res.status).toBe(403);
    expect(service[serviceFn]).not.toHaveBeenCalled();
  });

  it('test_should_return_401_when_unauthenticated', async () => {
    const unauth = NextResponse.json({ error: 'Missing or malformed Authorization header' }, { status: 401 });
    requireAdminUser.mockResolvedValue(unauth);

    const res = await call();

    expect(res.status).toBe(401);
    expect(service[serviceFn]).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/sessions', () => {
  it('test_should_apply_defaults_when_no_params', async () => {
    service.listSessions.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 });

    const res = await listSessions(req('/api/admin/sessions'));

    expect(res.status).toBe(200);
    expect(service.listSessions).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, limit: 25, offset: 0 });
  });

  it('test_should_pass_every_filter_through_to_the_service', async () => {
    const item = makeSessionItem();
    service.listSessions.mockResolvedValue({ items: [item], total: 41, limit: 10, offset: 20 });

    const res = await listSessions(req(
      '/api/admin/sessions',
      '?status=Accepted&status=Pending&from=2026-11-01&to=2026-11-30&search=%20ana%40uni%20'
      + '&upcoming=true&missingMeet=true&includeTest=true&limit=10&offset=20',
    ));
    const json = await res.json();

    expect(service.listSessions).toHaveBeenCalledWith({
      statuses: ['Accepted', 'Pending'],
      from: '2026-11-01',
      to: '2026-11-30',
      search: 'ana@uni',
      upcoming: true,
      missingMeet: true,
      includeTest: true,
      limit: 10,
      offset: 20,
    });
    expect(json).toEqual({ success: true, items: [JSON.parse(JSON.stringify(item))], total: 41, limit: 10, offset: 20 });
  });

  it.each([
    ['an unknown status', '?status=Done'],
    ['a malformed date', '?from=11/01/2026'],
    ['an impossible date', '?to=2026-02-31'],
    ['from after to', '?from=2026-11-30&to=2026-11-01'],
    ['a flag that is not true/false', '?upcoming=yes'],
    ['a limit above 100', '?limit=500'],
    ['a negative offset', '?offset=-1'],
    ['a search longer than 100 chars', `?search=${'a'.repeat(101)}`],
  ])('test_should_return_400_for_%s', async (_label, qs) => {
    const res = await listSessions(req('/api/admin/sessions', qs));

    expect(res.status).toBe(400);
    expect((await res.json()).success).toBe(false);
    expect(service.listSessions).not.toHaveBeenCalled();
  });

  it('test_should_return_500_when_the_service_throws', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    service.listSessions.mockRejectedValue(new Error('db down'));

    const res = await listSessions(req('/api/admin/sessions'));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Internal server error' });
    errSpy.mockRestore();
  });
});

describe('GET /api/admin/sessions/export', () => {
  it('test_should_return_csv_attachment_with_the_same_filters_as_the_table', async () => {
    service.sessionsCsv.mockResolvedValue('\uFEFFID,Inicio\r\nsess-1,2026-11-11 10:00');

    const res = await exportSessions(req(
      '/api/admin/sessions/export',
      '?status=Canceled&from=2026-11-01&search=isis&includeTest=true&limit=3',
    ));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="tutorias-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(await res.text()).toContain('sess-1,2026-11-11 10:00');
    // limit/offset are not export params: the cap is the service's.
    expect(service.sessionsCsv).toHaveBeenCalledWith(
      { ...DEFAULT_FILTERS, statuses: ['Canceled'], from: '2026-11-01', search: 'isis', includeTest: true },
      expect.any(Date),
    );
  });

  it('test_should_return_400_for_invalid_filters', async () => {
    const res = await exportSessions(req('/api/admin/sessions/export', '?status=Nope'));

    expect(res.status).toBe(400);
    expect(service.sessionsCsv).not.toHaveBeenCalled();
  });

  it('test_should_return_500_when_the_service_throws', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    service.sessionsCsv.mockRejectedValue(new Error('db down'));

    const res = await exportSessions(req('/api/admin/sessions/export'));

    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});

describe('GET /api/admin/payments/unbooked', () => {
  it('test_should_return_the_unbooked_items', async () => {
    const item = makeUnbookedItem();
    service.listUnbookedPayments.mockResolvedValue([item]);

    const res = await listUnbooked(req('/api/admin/payments/unbooked'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, items: [item] });
  });

  it('test_should_return_500_when_the_service_throws', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    service.listUnbookedPayments.mockRejectedValue(new Error('db down'));

    const res = await listUnbooked(req('/api/admin/payments/unbooked'));

    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});
