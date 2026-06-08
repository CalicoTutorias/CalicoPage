/**
 * @jest-environment node
 *
 * Unit tests for the route guards in `src/lib/auth/guards.js`.
 *
 * The guards are the last line of defence before privileged handlers run, so
 * the tests pin down every reject path (401/403/429/500) and verify the two
 * security-critical invariants:
 *   1. requireAdminUser reads the role from the DB, never trusting the JWT.
 *   2. a disabled or non-admin account can never pass.
 *
 * authenticateRequest, rateLimit and prisma are mocked so each guard is tested
 * in isolation from token parsing and the database.
 */

jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
}));
jest.mock('@/lib/auth/rateLimit', () => ({
  rateLimit: jest.fn(() => null),
}));
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
  },
}));

const { NextResponse } = require('next/server');
const { authenticateRequest } = require('@/lib/auth/middleware');
const { rateLimit } = require('@/lib/auth/rateLimit');
const prisma = require('@/lib/prisma').default;
const {
  requireAdminSecret,
  requireAdmin,
  requireAdminUser,
  requireTutor,
} = require('@/lib/auth/guards');

beforeEach(() => {
  jest.clearAllMocks();
  rateLimit.mockReturnValue(null);
});

/** Build a Request carrying the given headers. */
function requestWith(headers = {}) {
  return new Request('http://localhost/api/admin/thing', { headers });
}

// ─── requireAdminSecret ──────────────────────────────────────────────

describe('requireAdminSecret', () => {
  const ORIGINAL = process.env.ADMIN_SECRET;
  afterEach(() => { process.env.ADMIN_SECRET = ORIGINAL; });

  it('returns 500 when ADMIN_SECRET is not configured', async () => {
    delete process.env.ADMIN_SECRET;
    // The guard logs the misconfiguration; silence it to keep test output clean.
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = requireAdminSecret(requestWith({ 'x-admin-secret': 'whatever' }));

    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(500);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('returns 401 when the secret header is missing', async () => {
    process.env.ADMIN_SECRET = 'top-secret';
    const res = requireAdminSecret(requestWith({}));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('UNAUTHORIZED');
  });

  it('returns 401 when the secret header does not match', async () => {
    process.env.ADMIN_SECRET = 'top-secret';
    const res = requireAdminSecret(requestWith({ 'x-admin-secret': 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('returns true when the secret matches', () => {
    process.env.ADMIN_SECRET = 'top-secret';
    const res = requireAdminSecret(requestWith({ 'x-admin-secret': 'top-secret' }));
    expect(res).toBe(true);
  });

  it('requireAdmin is an alias of requireAdminSecret', () => {
    expect(requireAdmin).toBe(requireAdminSecret);
  });
});

// ─── requireAdminUser ────────────────────────────────────────────────

describe('requireAdminUser', () => {
  const adminPayload = { sub: 'admin-1', email: 'admin@calico.com' };

  it('short-circuits with the 401 from authenticateRequest', async () => {
    const unauthorized = NextResponse.json({ error: 'nope' }, { status: 401 });
    authenticateRequest.mockReturnValue(unauthorized);

    const res = await requireAdminUser(requestWith());

    expect(res).toBe(unauthorized);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns 401 USER_NOT_FOUND when the DB has no such user', async () => {
    authenticateRequest.mockReturnValue(adminPayload);
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await requireAdminUser(requestWith());

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'admin-1' } }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('USER_NOT_FOUND');
  });

  it('returns 403 ACCOUNT_DISABLED when the user is inactive', async () => {
    authenticateRequest.mockReturnValue(adminPayload);
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-1', email: 'admin@calico.com', role: 'ADMIN', isActive: false,
    });

    const res = await requireAdminUser(requestWith());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('ACCOUNT_DISABLED');
  });

  it('returns 403 FORBIDDEN when the DB role is not ADMIN, even if the JWT claimed admin', async () => {
    // JWT-style payload can claim anything; the guard must rely on the DB role.
    authenticateRequest.mockReturnValue({ ...adminPayload, role: 'ADMIN' });
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-1', email: 'admin@calico.com', role: 'STUDENT', isActive: true,
    });

    const res = await requireAdminUser(requestWith());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('FORBIDDEN');
  });

  it('returns the 429 from the rate limiter when the admin is flooding', async () => {
    authenticateRequest.mockReturnValue(adminPayload);
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-1', email: 'admin@calico.com', role: 'ADMIN', isActive: true,
    });
    const limited = NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
    rateLimit.mockReturnValue(limited);

    const res = await requireAdminUser(requestWith());
    expect(res).toBe(limited);
  });

  it('returns the payload enriched with the fresh DB role on success', async () => {
    authenticateRequest.mockReturnValue(adminPayload);
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-1', email: 'admin@calico.com', role: 'ADMIN', isActive: true,
    });

    const res = await requireAdminUser(requestWith());

    expect(res).not.toBeInstanceOf(NextResponse);
    expect(res).toMatchObject({ sub: 'admin-1', role: 'ADMIN' });
    expect(rateLimit).toHaveBeenCalledWith('admin:admin-1', expect.objectContaining({ max: 30 }));
  });
});

// ─── requireTutor ────────────────────────────────────────────────────

describe('requireTutor', () => {
  it('short-circuits with the 401 from authenticateRequest', () => {
    const unauthorized = NextResponse.json({ error: 'nope' }, { status: 401 });
    authenticateRequest.mockReturnValue(unauthorized);

    const res = requireTutor(requestWith());
    expect(res).toBe(unauthorized);
  });

  it('returns 403 TUTOR_NOT_APPROVED for a non-approved tutor', async () => {
    authenticateRequest.mockReturnValue({ sub: 'u1', isTutorApproved: false });

    const res = requireTutor(requestWith());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('TUTOR_NOT_APPROVED');
  });

  it('returns the payload for an approved tutor', () => {
    const payload = { sub: 'u1', isTutorApproved: true };
    authenticateRequest.mockReturnValue(payload);

    const res = requireTutor(requestWith());
    expect(res).toBe(payload);
  });
});
