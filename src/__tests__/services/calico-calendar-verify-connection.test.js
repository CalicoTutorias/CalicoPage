/**
 * @jest-environment node
 *
 * calicoCalendarService.verifyConnection() — the probe behind
 * /api/health/calendar.
 *
 * Two regressions are pinned here:
 *   1. It used to probe `calendarList.list`, which needs `calendar.readonly`.
 *      Event creation only ever uses `calendar.events`, so an admin token
 *      scoped just for events failed the health check while the app worked.
 *   2. Every non-401 failure collapsed into `unknown_error`, so a 403 (missing
 *      scope, Calendar API disabled) was indistinguishable from a dead token.
 */

const listEvents = jest.fn();
const listCalendars = jest.fn();

jest.mock('@googleapis/calendar', () => ({
  calendar: jest.fn(() => ({
    events: { list: listEvents },
    calendarList: { list: listCalendars },
  })),
}));

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ setCredentials: jest.fn() })),
}));

jest.mock('@sentry/nextjs', () => ({
  withScope: jest.fn(),
  captureMessage: jest.fn(),
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

function gaxiosError(status, message = 'boom') {
  return Object.assign(new Error(message), { code: status });
}

let service;

beforeEach(async () => {
  jest.resetModules();
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});

  process.env.GOOGLE_CLIENT_ID = 'client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
  process.env.GOOGLE_ADMIN_REFRESH_TOKEN = 'refresh-token';
  process.env.CALICO_CALENDAR_ID = 'calico-calendar';

  service = await import('@/lib/services/calico-calendar.service');
});

afterEach(() => {
  console.warn.mockRestore();
});

describe('verifyConnection', () => {
  it('probes events on the central calendar, not the calendar list', async () => {
    listEvents.mockResolvedValue({ data: { items: [] } });

    const result = await service.verifyConnection();

    expect(result).toEqual({ configured: true, connected: true, reason: null });
    expect(listEvents).toHaveBeenCalledWith({ calendarId: 'calico-calendar', maxResults: 1 });
    // calendarList.list needs a scope event creation never uses.
    expect(listCalendars).not.toHaveBeenCalled();
  });

  it('reports a 403 as a permission problem, not as an unknown error', async () => {
    listEvents.mockRejectedValue(gaxiosError(403, 'Insufficient Permission'));

    const result = await service.verifyConnection();

    expect(result.connected).toBe(false);
    expect(result.reason).toBe('CALENDAR_PERMISSION_DENIED');
  });

  it('reports an expired refresh token as needing reauth', async () => {
    listEvents.mockRejectedValue(gaxiosError(400, 'invalid_grant'));

    const result = await service.verifyConnection();

    expect(result.connected).toBe(false);
    expect(result.reason).toBe('CALENDAR_REAUTH_REQUIRED');
  });

  it('reports a missing calendar as not found', async () => {
    listEvents.mockRejectedValue(gaxiosError(404, 'Not Found'));

    const result = await service.verifyConnection();

    expect(result.reason).toBe('CALENDAR_NOT_FOUND');
  });

  it('never logs the error object', async () => {
    listEvents.mockRejectedValue(
      Object.assign(gaxiosError(400, 'invalid_grant'), {
        config: { data: 'refresh_token=1//04-secret' },
      }),
    );

    await service.verifyConnection();

    const logged = JSON.stringify(console.warn.mock.calls);
    expect(logged).not.toContain('refresh_token');
    expect(logged).not.toContain('invalid_grant');
  });

  it('reports not_configured when env vars are missing', async () => {
    jest.resetModules();
    delete process.env.GOOGLE_ADMIN_REFRESH_TOKEN;
    const fresh = await import('@/lib/services/calico-calendar.service');

    const result = await fresh.verifyConnection();

    expect(result).toEqual({ configured: false, connected: false, reason: 'not_configured' });
    expect(listEvents).not.toHaveBeenCalled();
  });
});
