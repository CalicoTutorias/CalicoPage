/**
 * @jest-environment node
 *
 * Integration tests — conexión con Google Calendar
 *   POST /api/calendar/disconnect     → limpia estado + borra bloques calendar_sync
 *   GET  /api/calendar/check-connection → renueva el access token con el refresh token
 *
 * Contexto: un tutor con 52 bloques `calendar_sync` huérfanos tras desconectar
 * Google seguía viéndolos (duplicando y tapando sus bloques manuales); y con
 * el access token caducado (1 h) la UI pasaba a «expirado» aunque el refresh
 * token siguiera vivo.
 */

const cookieStore = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
};

jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => cookieStore),
}));

jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
}));

jest.mock('@/lib/services/availability.service', () => ({
  upsertSchedule: jest.fn(),
  clearCalendarSyncedAvailability: jest.fn(),
}));

jest.mock('@/lib/services/calendar.service', () => ({
  listCalendars: jest.fn(),
  refreshAccessToken: jest.fn(),
}));

const { NextResponse } = require('next/server');
const { authenticateRequest } = require('@/lib/auth/middleware');
const availabilityService = require('@/lib/services/availability.service');
const calendarService = require('@/lib/services/calendar.service');

const USER = 'tutor-1';

function setCookies(map) {
  cookieStore.get.mockImplementation((name) =>
    map[name] !== undefined ? { value: map[name] } : undefined,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  authenticateRequest.mockResolvedValue({ sub: USER });
});

describe('POST /api/calendar/disconnect', () => {
  const { POST } = require('@/app/api/calendar/disconnect/route');

  it('borra las cookies, resetea el modo y elimina los bloques calendar_sync', async () => {
    availabilityService.upsertSchedule.mockResolvedValue({});
    availabilityService.clearCalendarSyncedAvailability.mockResolvedValue(52);

    const res = await POST(new Request('http://localhost/api/calendar/disconnect', { method: 'POST' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, removedSyncedBlocks: 52 });
    expect(cookieStore.delete).toHaveBeenCalledWith('calendar_access_token');
    expect(cookieStore.delete).toHaveBeenCalledWith('calendar_refresh_token');
    expect(availabilityService.upsertSchedule).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ calendarConnectedAt: null, calendarSyncMode: 'available' }),
    );
    expect(availabilityService.clearCalendarSyncedAvailability).toHaveBeenCalledWith(USER);
  });

  it('exige autenticación', async () => {
    authenticateRequest.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 401 }),
    );

    const res = await POST(new Request('http://localhost/api/calendar/disconnect', { method: 'POST' }));

    expect(res.status).toBe(401);
    expect(availabilityService.clearCalendarSyncedAvailability).not.toHaveBeenCalled();
  });
});

describe('GET /api/calendar/check-connection', () => {
  const { GET } = require('@/app/api/calendar/check-connection/route');
  const req = () => new Request('http://localhost/api/calendar/check-connection');

  it('reporta conectado cuando el access token es válido, sin renovar nada', async () => {
    setCookies({ calendar_access_token: 'ok', calendar_refresh_token: 'r' });
    calendarService.listCalendars.mockResolvedValue([]);

    const body = await (await GET(req())).json();

    expect(body).toMatchObject({ connected: true, tokenValid: true, refreshed: false });
    expect(calendarService.refreshAccessToken).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('renueva con el refresh token cuando el access token caducó y reescribe la cookie', async () => {
    setCookies({ calendar_access_token: 'stale', calendar_refresh_token: 'r' });
    calendarService.listCalendars.mockRejectedValue(new Error('401 Invalid Credentials'));
    calendarService.refreshAccessToken.mockResolvedValue({ access_token: 'fresh' });

    const body = await (await GET(req())).json();

    expect(calendarService.refreshAccessToken).toHaveBeenCalledWith('r');
    expect(cookieStore.set).toHaveBeenCalledWith(
      'calendar_access_token',
      'fresh',
      expect.objectContaining({ httpOnly: true, maxAge: 3600, path: '/' }),
    );
    expect(body).toMatchObject({ connected: true, tokenValid: true, refreshed: true });
  });

  it('renueva también cuando solo queda el refresh token (cookie de acceso ya expirada)', async () => {
    setCookies({ calendar_refresh_token: 'r' });
    calendarService.refreshAccessToken.mockResolvedValue({ access_token: 'fresh' });

    const body = await (await GET(req())).json();

    expect(calendarService.listCalendars).not.toHaveBeenCalled();
    expect(body).toMatchObject({ connected: true, hasAccessToken: true, refreshed: true });
  });

  it('queda como expirado si el refresh falla', async () => {
    setCookies({ calendar_access_token: 'stale', calendar_refresh_token: 'r' });
    calendarService.listCalendars.mockRejectedValue(new Error('401'));
    calendarService.refreshAccessToken.mockRejectedValue(new Error('invalid_grant'));

    const body = await (await GET(req())).json();

    expect(body).toMatchObject({ connected: false, hasAccessToken: true, tokenValid: false, refreshed: false });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('sin cookies no está conectado y no intenta renovar', async () => {
    setCookies({});

    const body = await (await GET(req())).json();

    expect(body).toMatchObject({ connected: false, hasAccessToken: false, hasRefreshToken: false });
    expect(calendarService.refreshAccessToken).not.toHaveBeenCalled();
  });
});
