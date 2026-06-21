/**
 * @jest-environment node
 *
 * Unit tests for `src/lib/auth/middleware.js`.
 *
 * Tested end-to-end against the real jwt helpers (not mocked) so the Bearer
 * extraction and the token verification are exercised together — that seam is
 * exactly where auth bypasses tend to hide. Prisma is mocked since the
 * session-freshness check (isActive + tokenVersion) hits the DB.
 */

process.env.JWT_SECRET = 'test-secret-key';
process.env.JWT_EXPIRATION = '2h';

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
  },
}));

const { NextResponse } = require('next/server');
const jwt = require('jsonwebtoken');
const { signToken } = require('@/lib/auth/jwt');
const prisma = require('@/lib/prisma').default;
const {
  authenticateRequest,
  tryAuthenticateRequest,
} = require('@/lib/auth/middleware');

const user = {
  id: 'user-123',
  email: 'tutor@calico.com',
  isTutorRequested: true,
  isTutorApproved: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  // Fresh session by default: account active, tokenVersion matches the
  // (default 0) version baked into tokens signed by signToken(user) above.
  prisma.user.findUnique.mockResolvedValue({ isActive: true, tokenVersion: 0 });
});

/** Build a minimal Request with the given Authorization header (or none). */
function requestWith(authHeader) {
  const headers = authHeader ? { authorization: authHeader } : {};
  return new Request('http://localhost/api/protected', { headers });
}

describe('authenticateRequest', () => {
  it('returns the decoded payload for a valid Bearer token', async () => {
    const token = signToken(user);
    const result = await authenticateRequest(requestWith(`Bearer ${token}`));

    expect(result).not.toBeInstanceOf(NextResponse);
    expect(result.sub).toBe('user-123');
    expect(result.email).toBe('tutor@calico.com');
    expect(result.isTutorApproved).toBe(false);
  });

  it('returns a 401 when the Authorization header is missing', async () => {
    const result = await authenticateRequest(requestWith(null));

    expect(result).toBeInstanceOf(NextResponse);
    expect(result.status).toBe(401);
    const json = await result.json();
    expect(json.error).toMatch(/Missing or malformed/i);
  });

  it('returns a 401 when the scheme is not "Bearer "', async () => {
    const token = signToken(user);
    const result = await authenticateRequest(requestWith(`Basic ${token}`));

    expect(result).toBeInstanceOf(NextResponse);
    expect(result.status).toBe(401);
  });

  it('returns a 401 with TOKEN_INVALID for a tampered token', async () => {
    const forged = jwt.sign({ sub: 'attacker' }, 'wrong-secret');
    const result = await authenticateRequest(requestWith(`Bearer ${forged}`));

    expect(result).toBeInstanceOf(NextResponse);
    expect(result.status).toBe(401);
    const json = await result.json();
    expect(json.code).toBe('TOKEN_INVALID');
  });

  it('returns a 401 with TOKEN_EXPIRED for an expired token', async () => {
    const expired = jwt.sign({ sub: 'user-123' }, 'test-secret-key', {
      expiresIn: -5,
    });
    const result = await authenticateRequest(requestWith(`Bearer ${expired}`));

    expect(result.status).toBe(401);
    const json = await result.json();
    expect(json.code).toBe('TOKEN_EXPIRED');
  });

  it('returns a 401 with TOKEN_REVOKED when tokenVersion no longer matches the DB', async () => {
    const token = signToken(user); // tokenVersion: 0
    prisma.user.findUnique.mockResolvedValue({ isActive: true, tokenVersion: 1 });

    const result = await authenticateRequest(requestWith(`Bearer ${token}`));

    expect(result).toBeInstanceOf(NextResponse);
    expect(result.status).toBe(401);
    const json = await result.json();
    expect(json.code).toBe('TOKEN_REVOKED');
  });

  it('returns a 401 with ACCOUNT_DISABLED when the user has been suspended', async () => {
    const token = signToken(user);
    prisma.user.findUnique.mockResolvedValue({ isActive: false, tokenVersion: 0 });

    const result = await authenticateRequest(requestWith(`Bearer ${token}`));

    expect(result).toBeInstanceOf(NextResponse);
    expect(result.status).toBe(401);
    const json = await result.json();
    expect(json.code).toBe('ACCOUNT_DISABLED');
  });
});

describe('tryAuthenticateRequest', () => {
  it('returns the payload for a valid token', async () => {
    const token = signToken(user);
    const result = await tryAuthenticateRequest(requestWith(`Bearer ${token}`));
    expect(result.sub).toBe('user-123');
  });

  it('returns null (no 401) when the header is missing', async () => {
    expect(await tryAuthenticateRequest(requestWith(null))).toBeNull();
  });

  it('returns null for an invalid token instead of throwing', async () => {
    const result = await tryAuthenticateRequest(requestWith('Bearer garbage.token.here'));
    expect(result).toBeNull();
  });

  it('returns null when the session is stale (revoked or disabled)', async () => {
    const token = signToken(user);
    prisma.user.findUnique.mockResolvedValue({ isActive: true, tokenVersion: 1 });

    const result = await tryAuthenticateRequest(requestWith(`Bearer ${token}`));
    expect(result).toBeNull();
  });
});
