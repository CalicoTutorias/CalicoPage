/**
 * @jest-environment node
 *
 * Integration tests — conexión con Google Calendar
 *   POST /api/calendar/disconnect       → revoca la credencial, limpia estado + borra bloques calendar_sync
 *   GET  /api/calendar/check-connection → estado de la credencial persistida
 *   GET  /api/calendar/list             → 400/401 tipificados cuando no hay conexión
 *
 * Contexto: los tokens dejaron de vivir en cookies del navegador (un tutor
 * quedaba "desconectado" en silencio a los 30 días o al cambiar de equipo);
 * ahora los sirve `calendar-credential.service` desde la base.
 */

jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
}));

jest.mock('@/lib/services/availability.service', () => ({
  upsertSchedule: jest.fn(),
  clearCalendarSyncedAvailability: jest.fn(),
}));

jest.mock('@/lib/services/calendar.service', () => ({
  listCalendars: jest.fn(),
}));

jest.mock('@/lib/services/calendar-credential.service', () => {
  const actual = jest.requireActual('@/lib/services/calendar-credential.service');
  return {
    CalendarAuthError: actual.CalendarAuthError,
    CALENDAR_AUTH_CODES: actual.CALENDAR_AUTH_CODES,
    getConnectionStatus: jest.fn(),
    getAccessToken: jest.fn(),
    revoke: jest.fn(),
  };
});

const { NextResponse } = require('next/server');
const { authenticateRequest } = require('@/lib/auth/middleware');
const availabilityService = require('@/lib/services/availability.service');
const calendarService = require('@/lib/services/calendar.service');
const credentialService = require('@/lib/services/calendar-credential.service');

const USER = 'tutor-1';

beforeEach(() => {
  jest.clearAllMocks();
  authenticateRequest.mockResolvedValue({ sub: USER });
});

describe('POST /api/calendar/disconnect', () => {
  const { POST } = require('@/app/api/calendar/disconnect/route');

  it('revoca la credencial, resetea el modo, elimina los bloques calendar_sync y borra las cookies antiguas', async () => {
    credentialService.revoke.mockResolvedValue(true);
    availabilityService.upsertSchedule.mockResolvedValue({});
    availabilityService.clearCalendarSyncedAvailability.mockResolvedValue(52);

    const res = await POST(new Request('http://localhost/api/calendar/disconnect', { method: 'POST' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, removedSyncedBlocks: 52 });
    expect(credentialService.revoke).toHaveBeenCalledWith(USER);
    expect(availabilityService.upsertSchedule).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ calendarConnectedAt: null, calendarSyncMode: 'available' }),
    );
    expect(availabilityService.clearCalendarSyncedAvailability).toHaveBeenCalledWith(USER);

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/calendar_access_token=;/);
    expect(setCookie).toMatch(/calendar_refresh_token=;/);
  });

  it('exige autenticación', async () => {
    authenticateRequest.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 401 }),
    );

    const res = await POST(new Request('http://localhost/api/calendar/disconnect', { method: 'POST' }));

    expect(res.status).toBe(401);
    expect(credentialService.revoke).not.toHaveBeenCalled();
  });
});

describe('GET /api/calendar/check-connection', () => {
  const { GET } = require('@/app/api/calendar/check-connection/route');
  const req = () => new Request('http://localhost/api/calendar/check-connection');

  it('devuelve el estado tal cual lo calcula el servicio, para el usuario del JWT', async () => {
    credentialService.getConnectionStatus.mockResolvedValue({
      connected: true, status: 'connected', refreshed: true, connectedAt: '2026-08-24T02:08:55.093Z',
    });

    const res = await GET(req());

    expect(credentialService.getConnectionStatus).toHaveBeenCalledWith(USER);
    await expect(res.json()).resolves.toMatchObject({ connected: true, status: 'connected', refreshed: true });
  });

  it('un fallo inesperado responde 500 sin romper el contrato', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    credentialService.getConnectionStatus.mockRejectedValue(new Error('db down'));

    const res = await GET(req());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ connected: false, status: 'error' });
    console.error.mockRestore();
  });
});

describe('GET /api/calendar/list (ruta que consume el token)', () => {
  const { GET } = require('@/app/api/calendar/list/route');
  const req = () => new Request('http://localhost/api/calendar/list');

  it('usa el access token del servicio de credenciales', async () => {
    credentialService.getAccessToken.mockResolvedValue({ accessToken: 'tok', refreshed: false });
    calendarService.listCalendars.mockResolvedValue([{ id: 'primary' }]);

    const body = await (await GET(req())).json();

    expect(credentialService.getAccessToken).toHaveBeenCalledWith(USER);
    expect(calendarService.listCalendars).toHaveBeenCalledWith('tok');
    expect(body).toEqual({ success: true, calendars: [{ id: 'primary' }] });
  });

  it('sin conexión responde 400 con código; credencial revocada responde 401', async () => {
    const { CalendarAuthError, CALENDAR_AUTH_CODES } = credentialService;

    credentialService.getAccessToken.mockRejectedValueOnce(
      new CalendarAuthError(CALENDAR_AUTH_CODES.NOT_CONNECTED),
    );
    let res = await GET(req());
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ success: false, code: 'CALENDAR_NOT_CONNECTED' });

    credentialService.getAccessToken.mockRejectedValueOnce(
      new CalendarAuthError(CALENDAR_AUTH_CODES.REAUTH_REQUIRED),
    );
    res = await GET(req());
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ success: false, code: 'CALENDAR_REAUTH_REQUIRED' });
    expect(calendarService.listCalendars).not.toHaveBeenCalled();
  });
});
