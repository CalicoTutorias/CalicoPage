/**
 * @jest-environment node
 *
 * Unit tests for the JWT helpers in `src/lib/auth/jwt.js`.
 *
 * These tokens gate every authenticated request, so the tests cover the full
 * round-trip plus the three failure modes the rest of the app branches on:
 * tampered/invalid signatures, expired tokens, and a missing JWT_SECRET.
 *
 * NOTE: jwt.js reads `process.env.JWT_SECRET` / `JWT_EXPIRATION` at module-load
 * time, so the env vars are set *before* the first require below. The
 * "missing secret" cases re-import the module in isolation with the var unset.
 */

process.env.JWT_SECRET = 'test-secret-key';
process.env.JWT_EXPIRATION = '2h';

const jwt = require('jsonwebtoken');
const { signToken, verifyToken } = require('@/lib/auth/jwt');

const baseUser = {
  id: 'user-123',
  email: 'tutor@calico.com',
  isTutorRequested: true,
  isTutorApproved: true,
};

describe('signToken', () => {
  it('returns a verifiable JWT string', () => {
    const token = signToken(baseUser);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // header.payload.signature
  });

  it('encodes the essential authorization claims', () => {
    const token = signToken(baseUser);
    const decoded = jwt.verify(token, 'test-secret-key');

    expect(decoded.sub).toBe('user-123');
    expect(decoded.email).toBe('tutor@calico.com');
    expect(decoded.isTutorRequested).toBe(true);
    expect(decoded.isTutorApproved).toBe(true);
  });

  it('defaults the tutor flags to false when omitted', () => {
    const token = signToken({ id: 'u1', email: 'student@calico.com' });
    const decoded = jwt.verify(token, 'test-secret-key');

    expect(decoded.isTutorRequested).toBe(false);
    expect(decoded.isTutorApproved).toBe(false);
  });

  it('honours the configured JWT_EXPIRATION window (2h)', () => {
    const token = signToken(baseUser);
    const decoded = jwt.verify(token, 'test-secret-key');
    expect(decoded.exp - decoded.iat).toBe(2 * 60 * 60);
  });

  it('does NOT leak sensitive fields like password into the token', () => {
    const token = signToken({ ...baseUser, password: 'hashed-secret' });
    const decoded = jwt.verify(token, 'test-secret-key');
    expect(decoded.password).toBeUndefined();
  });
});

describe('verifyToken', () => {
  it('accepts a token this module signed and returns the payload', () => {
    const token = signToken(baseUser);
    const result = verifyToken(token);

    expect(result.success).toBe(true);
    expect(result.payload.sub).toBe('user-123');
    expect(result.payload.email).toBe('tutor@calico.com');
  });

  it('rejects a malformed / garbage token as TOKEN_INVALID', () => {
    const result = verifyToken('not-a-real-jwt');
    expect(result).toMatchObject({ success: false, code: 'TOKEN_INVALID' });
  });

  it('rejects a token signed with a different secret as TOKEN_INVALID', () => {
    const forged = jwt.sign({ sub: 'attacker' }, 'wrong-secret');
    const result = verifyToken(forged);
    expect(result).toMatchObject({ success: false, code: 'TOKEN_INVALID' });
  });

  it('reports TOKEN_EXPIRED for a token past its expiry', () => {
    const expired = jwt.sign({ sub: 'user-123' }, 'test-secret-key', {
      expiresIn: -10,
    });
    const result = verifyToken(expired);
    expect(result).toMatchObject({ success: false, code: 'TOKEN_EXPIRED' });
  });
});

describe('missing JWT_SECRET configuration', () => {
  it('throws on sign and verify when JWT_SECRET is unset', () => {
    jest.isolateModules(() => {
      const original = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      try {
        const mod = require('@/lib/auth/jwt');
        expect(() => mod.signToken(baseUser)).toThrow('JWT_SECRET');
        expect(() => mod.verifyToken('anything')).toThrow('JWT_SECRET');
      } finally {
        process.env.JWT_SECRET = original;
      }
    });
  });
});
