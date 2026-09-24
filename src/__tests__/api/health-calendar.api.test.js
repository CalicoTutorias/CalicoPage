/**
 * @jest-environment node
 *
 * GET /api/health/calendar — the endpoint the hourly Apps Script monitor polls.
 * It is public, so the contract is that the body never carries anything beyond
 * `ok`: no reason, no env var names, nothing about why the token failed.
 */

jest.mock('@/lib/services/calico-calendar.service', () => ({
  verifyConnection: jest.fn(),
}));

const calicoCalendarService = require('@/lib/services/calico-calendar.service');
const { GET } = require('@/app/api/health/calendar/route');

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

describe('GET /api/health/calendar', () => {
  it('returns 200 { ok: true } when the calendar is connected', async () => {
    calicoCalendarService.verifyConnection.mockResolvedValue({
      configured: true,
      connected: true,
      reason: null,
    });

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('returns 503 { ok: false } when the admin token is dead', async () => {
    calicoCalendarService.verifyConnection.mockResolvedValue({
      configured: true,
      connected: false,
      reason: 'token_expired',
    });

    const res = await GET();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ ok: false });
  });

  it('returns 503 { ok: false } when the check itself throws', async () => {
    calicoCalendarService.verifyConnection.mockRejectedValue(new Error('boom'));

    const res = await GET();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ ok: false });
  });

  it('never leaks the reason or the error object', async () => {
    const gaxiosLike = Object.assign(new Error('invalid_grant'), {
      code: 400,
      config: { data: 'refresh_token=1//04-secret&client_id=abc' },
    });
    calicoCalendarService.verifyConnection.mockRejectedValue(gaxiosLike);

    const res = await GET();
    const body = await res.json();

    expect(Object.keys(body)).toEqual(['ok']);
    const logged = JSON.stringify(console.error.mock.calls);
    expect(logged).not.toContain('refresh_token');
    expect(logged).not.toContain('invalid_grant');
  });
});
