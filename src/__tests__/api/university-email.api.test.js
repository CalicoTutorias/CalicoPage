/**
 * @jest-environment node
 *
 * University email routes:
 *   GET/POST/DELETE /api/users/me/university-email  (logged-in user, identity from the JWT)
 *   POST            /api/auth/verify-university-email  (no session; token from the link)
 */

jest.mock('@/lib/auth/middleware', () => ({ authenticateRequest: jest.fn() }));
jest.mock('@/lib/auth/rateLimit', () => ({ rateLimit: jest.fn(() => null), getClientIp: jest.fn(() => '1.2.3.4') }));
jest.mock('@/lib/services/university-email.service', () => ({
  getStatus: jest.fn(),
  requestVerification: jest.fn(),
  remove: jest.fn(),
  verifyToken: jest.fn(),
}));

const { NextResponse } = require('next/server');
const { authenticateRequest } = require('@/lib/auth/middleware');
const service = require('@/lib/services/university-email.service');
const meRoute = require('@/app/api/users/me/university-email/route');
const verifyRoute = require('@/app/api/auth/verify-university-email/route');

const req = (method, url, body) => new Request(`http://localhost${url}`, {
  method,
  headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
  ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
});
const domainError = (code, extra = {}) => Object.assign(new Error(code), { code, ...extra });
const STATUS = { email: null, university: null, verifiedAt: null, pendingEmail: 'a@uniandes.edu.co', resendAvailableAt: null };

beforeEach(() => {
  jest.clearAllMocks();
  authenticateRequest.mockResolvedValue({ sub: 'user-1' });
});

describe('/api/users/me/university-email', () => {
  it('needs a session', async () => {
    authenticateRequest.mockResolvedValue(NextResponse.json({ success: false }, { status: 401 }));
    const res = await meRoute.POST(req('POST', '/api/users/me/university-email', { email: 'a@uniandes.edu.co' }));
    expect(res.status).toBe(401);
    expect(service.requestVerification).not.toHaveBeenCalled();
  });

  it('POST uses the JWT identity and returns the new status', async () => {
    service.requestVerification.mockResolvedValue(STATUS);
    const res = await meRoute.POST(req('POST', '/api/users/me/university-email', { email: 'a@uniandes.edu.co' }));
    expect(res.status).toBe(200);
    expect(service.requestVerification).toHaveBeenCalledWith('user-1', 'a@uniandes.edu.co');
    expect(await res.json()).toEqual({ success: true, status: STATUS });
  });

  it('POST rejects extra keys (no userId from the body)', async () => {
    const res = await meRoute.POST(req('POST', '/api/users/me/university-email', { email: 'a@uniandes.edu.co', userId: 'other' }));
    expect(res.status).toBe(400);
    expect(service.requestVerification).not.toHaveBeenCalled();
  });

  it.each([
    ['DOMAIN_NOT_ALLOWED', 400],
    ['EMAIL_TAKEN', 409],
    ['ALREADY_VERIFIED', 409],
    ['EMAIL_SEND_FAILED', 502],
  ])('maps %s to %i', async (code, status) => {
    service.requestVerification.mockRejectedValue(domainError(code));
    const res = await meRoute.POST(req('POST', '/api/users/me/university-email', { email: 'a@uniandes.edu.co' }));
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);
  });

  it('COOLDOWN is a 429 with Retry-After', async () => {
    service.requestVerification.mockRejectedValue(domainError('COOLDOWN', { retryAfterSeconds: 42 }));
    const res = await meRoute.POST(req('POST', '/api/users/me/university-email', { email: 'a@uniandes.edu.co' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
  });

  it('GET and DELETE act on the caller only', async () => {
    service.getStatus.mockResolvedValue(STATUS);
    service.remove.mockResolvedValue({ ...STATUS, pendingEmail: null });
    expect((await meRoute.GET(req('GET', '/api/users/me/university-email'))).status).toBe(200);
    expect((await meRoute.DELETE(req('DELETE', '/api/users/me/university-email'))).status).toBe(200);
    expect(service.getStatus).toHaveBeenCalledWith('user-1');
    expect(service.remove).toHaveBeenCalledWith('user-1');
  });

  it('an unexpected error is a 500 without details', async () => {
    service.getStatus.mockRejectedValue(new Error('db password in message'));
    const res = await meRoute.GET(req('GET', '/api/users/me/university-email'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error interno' });
  });
});

describe('POST /api/auth/verify-university-email', () => {
  it.each([
    ['success', 200],
    ['invalid', 400],
    ['expired', 400],
    ['taken', 409],
  ])('%s → %i', async (status, http) => {
    service.verifyToken.mockResolvedValue({ status });
    const res = await verifyRoute.POST(req('POST', '/api/auth/verify-university-email', { token: 'abc' }));
    expect(res.status).toBe(http);
    expect((await res.json()).status).toBe(status);
    expect(service.verifyToken).toHaveBeenCalledWith('abc');
  });

  it('a body that is not JSON is invalid', async () => {
    const res = await verifyRoute.POST(req('POST', '/api/auth/verify-university-email', 'nope'));
    expect(res.status).toBe(400);
    expect(service.verifyToken).not.toHaveBeenCalled();
  });
});
