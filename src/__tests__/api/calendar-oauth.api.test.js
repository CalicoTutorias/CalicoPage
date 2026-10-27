/**
 * @jest-environment node
 *
 * Flujo OAuth de Google Calendar
 *   GET /api/calendar/auth-url → state firmado ligado al usuario + nonce en cookie
 *   GET /api/calendar/callback → verifica state/nonce y persiste la credencial
 *                                para el usuario del state, no para nadie más
 */

process.env.JWT_SECRET = 'test-secret-for-oauth-state';
process.env.NEXT_PUBLIC_APP_URL = 'http://app.test';

const cookieStore = { get: jest.fn() };

jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => cookieStore),
}));

jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
}));

jest.mock('@/lib/services/calendar.service', () => ({
  getAuthUrl: jest.fn(async (state) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`),
  exchangeCodeForTokens: jest.fn(),
}));

jest.mock('@/lib/services/calendar-credential.service', () => ({
  saveFromOAuth: jest.fn(),
}));

const { authenticateRequest } = require('@/lib/auth/middleware');
const calendarService = require('@/lib/services/calendar.service');
const credentialService = require('@/lib/services/calendar-credential.service');
const { createOAuthState, verifyOAuthState } = require('@/lib/auth/oauth-state');
const { GET: authUrl } = require('@/app/api/calendar/auth-url/route');
const { GET: callback } = require('@/app/api/calendar/callback/route');

const USER = 'tutor-1';

function cookieValue(res, name) {
  const header = res.headers.get('set-cookie') ?? '';
  const match = header.match(new RegExp(`${name}=([^;]*)`));
  return match ? match[1] : null;
}

beforeEach(() => {
  jest.clearAllMocks();
  authenticateRequest.mockResolvedValue({ sub: USER });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

describe('oauth-state', () => {
  it('solo acepta el state con su nonce, su propósito y dentro del TTL', () => {
    const { state, nonce } = createOAuthState(USER);
    expect(verifyOAuthState(state, nonce)).toBe(USER);
    expect(verifyOAuthState(state, 'otro-nonce')).toBeNull();
    expect(verifyOAuthState(state, undefined)).toBeNull();
    expect(verifyOAuthState('no-es-un-jwt', nonce)).toBeNull();
  });
});

describe('GET /api/calendar/auth-url', () => {
  it('firma el state con el usuario autenticado y deja el nonce en cookie HttpOnly', async () => {
    const res = await authUrl(new Request('http://localhost/api/calendar/auth-url'));
    const body = await res.json();

    const state = new URL(body.authUrl).searchParams.get('state');
    const nonce = cookieValue(res, 'calendar_oauth_state');
    expect(nonce).toBeTruthy();
    expect(verifyOAuthState(state, nonce)).toBe(USER);
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(res.headers.get('set-cookie')).toMatch(/Path=\/api\/calendar\/callback/);
  });
});

describe('GET /api/calendar/callback', () => {
  it('persiste la credencial del usuario del state y redirige a disponibilidad', async () => {
    const { state, nonce } = createOAuthState(USER);
    cookieStore.get.mockReturnValue({ value: nonce });
    calendarService.exchangeCodeForTokens.mockResolvedValue({ refresh_token: 'rt', access_token: 'at' });

    const res = await callback(new Request(`http://localhost/api/calendar/callback?code=abc&state=${state}`));

    expect(calendarService.exchangeCodeForTokens).toHaveBeenCalledWith('abc');
    expect(credentialService.saveFromOAuth).toHaveBeenCalledWith(USER, { refresh_token: 'rt', access_token: 'at' });
    expect(res.headers.get('location')).toBe('http://app.test/tutor/disponibilidad?calendar_connected=true');
    // nonce consumido y cookies de la era anterior borradas
    expect(res.headers.get('set-cookie')).toMatch(/calendar_oauth_state=;/);
    expect(res.headers.get('set-cookie')).toMatch(/calendar_refresh_token=;/);
  });

  it('rechaza un state cuyo nonce no coincide con la cookie (CSRF / inyección de código)', async () => {
    const { state } = createOAuthState(USER);
    cookieStore.get.mockReturnValue({ value: 'nonce-de-otro-navegador' });

    const res = await callback(new Request(`http://localhost/api/calendar/callback?code=abc&state=${state}`));

    expect(res.headers.get('location')).toMatch(/\/calendar-error\?error=/);
    expect(calendarService.exchangeCodeForTokens).not.toHaveBeenCalled();
    expect(credentialService.saveFromOAuth).not.toHaveBeenCalled();
  });

  it('sin código de autorización no intercambia nada', async () => {
    const { state, nonce } = createOAuthState(USER);
    cookieStore.get.mockReturnValue({ value: nonce });

    const res = await callback(new Request(`http://localhost/api/calendar/callback?state=${state}`));

    expect(res.headers.get('location')).toMatch(/No%20authorization%20code/);
    expect(calendarService.exchangeCodeForTokens).not.toHaveBeenCalled();
  });

  it('si guardar la credencial falla, redirige a la página de error', async () => {
    const { state, nonce } = createOAuthState(USER);
    cookieStore.get.mockReturnValue({ value: nonce });
    calendarService.exchangeCodeForTokens.mockResolvedValue({ access_token: 'at' });
    credentialService.saveFromOAuth.mockRejectedValue(new Error('no refresh token'));

    const res = await callback(new Request(`http://localhost/api/calendar/callback?code=abc&state=${state}`));

    expect(res.headers.get('location')).toMatch(/Error%20processing%20authorization/);
  });
});
