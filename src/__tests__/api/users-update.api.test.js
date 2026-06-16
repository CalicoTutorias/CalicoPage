/**
 * @jest-environment node
 *
 * Security tests for PUT /api/users/:id — the hardened self-service profile
 * endpoint. Verifies that the Zod whitelist:
 *
 *   1. Accepts legitimate { name, phoneNumber, careerId } updates.
 *   2. Rejects mass-assignment attempts on privilege fields
 *      (role, isTutorApproved, isEmailVerified, profilePictureUrl, tokens).
 *   3. Rejects empty bodies and malformed JSON.
 *   4. Still enforces own-profile-only access (403).
 *   5. Still requires authentication (401).
 *
 * `careerId` is a self-service field (the completar-perfil flow), but it is
 * validated as a UUID AND checked against the Career table, so a bogus value
 * is still a clean 400 rather than a Prisma foreign-key 500.
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@/lib/auth/middleware', () => ({
  // Stub: trust the `x-test-user` header to set the JWT subject; if absent,
  // return the same 401 shape the real middleware uses.
  authenticateRequest: jest.fn((request) => {
    const sub = request.headers.get('x-test-user');
    if (!sub) {
      const { NextResponse } = require('next/server');
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return { sub, email: 'test@calico.com' };
  }),
}));

jest.mock('@/lib/services/user.service', () => ({
  getUserById: jest.fn(),
  updateUser: jest.fn(),
}));

jest.mock('@/lib/services/academic.service', () => ({
  getCareerById: jest.fn(),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { PUT } from '@/app/api/users/[id]/route';
import * as userService from '@/lib/services/user.service';
import * as academicService from '@/lib/services/academic.service';

// A syntactically valid UUID for the careerId tests.
const VALID_CAREER_ID = '11111111-1111-4111-8111-111111111111';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildRequest({ userId = 'user-1', body, asUser = 'user-1', raw = false }) {
  const init = {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-test-user': asUser },
    body: raw ? body : JSON.stringify(body),
  };
  return new Request(`http://localhost/api/users/${userId}`, init);
}

async function callPut(opts) {
  const req = buildRequest(opts);
  const res = await PUT(req, { params: Promise.resolve({ id: opts.userId || 'user-1' }) });
  const json = await res.json();
  return { status: res.status, body: json };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PUT /api/users/:id (hardened)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    userService.updateUser.mockImplementation((id, data) =>
      Promise.resolve({ id, ...data }),
    );
    // Default: any career id resolves to an existing career.
    academicService.getCareerById.mockResolvedValue({ id: VALID_CAREER_ID, name: 'Ingeniería' });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Happy paths
  // ═══════════════════════════════════════════════════════════════════════════

  it('accepts { name, phoneNumber } and forwards to the service', async () => {
    const { status, body } = await callPut({
      userId: 'user-1',
      body: { name: 'Felipe', phoneNumber: '+57 300 000 0000' },
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(userService.updateUser).toHaveBeenCalledWith('user-1', {
      name: 'Felipe',
      phoneNumber: '+57 300 000 0000',
    });
  });

  it('accepts a single field (name only)', async () => {
    const { status } = await callPut({ userId: 'user-1', body: { name: 'Felipe' } });
    expect(status).toBe(200);
    expect(userService.updateUser).toHaveBeenCalledWith('user-1', { name: 'Felipe' });
  });

  it('accepts phoneNumber=null to clear the field', async () => {
    const { status } = await callPut({ userId: 'user-1', body: { phoneNumber: null } });
    expect(status).toBe(200);
    expect(userService.updateUser).toHaveBeenCalledWith('user-1', { phoneNumber: null });
  });

  it('trims whitespace from name before forwarding', async () => {
    const { status } = await callPut({
      userId: 'user-1',
      body: { name: '  Felipe  ' },
    });
    expect(status).toBe(200);
    expect(userService.updateUser).toHaveBeenCalledWith('user-1', { name: 'Felipe' });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // careerId — the completar-perfil self-service field
  // ═══════════════════════════════════════════════════════════════════════════

  describe('careerId', () => {
    it('accepts a valid careerId that exists and forwards it', async () => {
      const { status } = await callPut({
        userId: 'user-1',
        body: { careerId: VALID_CAREER_ID },
      });
      expect(status).toBe(200);
      expect(academicService.getCareerById).toHaveBeenCalledWith(VALID_CAREER_ID);
      expect(userService.updateUser).toHaveBeenCalledWith('user-1', { careerId: VALID_CAREER_ID });
    });

    it('accepts phoneNumber + careerId together (the completar-perfil payload)', async () => {
      const { status } = await callPut({
        userId: 'user-1',
        body: { phoneNumber: '+57 3000000000', careerId: VALID_CAREER_ID },
      });
      expect(status).toBe(200);
      expect(userService.updateUser).toHaveBeenCalledWith('user-1', {
        phoneNumber: '+57 3000000000',
        careerId: VALID_CAREER_ID,
      });
    });

    it('rejects a careerId that is not a UUID (no DB lookup)', async () => {
      const { status } = await callPut({
        userId: 'user-1',
        body: { careerId: 'not-a-uuid' },
      });
      expect(status).toBe(400);
      expect(academicService.getCareerById).not.toHaveBeenCalled();
      expect(userService.updateUser).not.toHaveBeenCalled();
    });

    it('rejects a well-formed careerId that does not exist (clean 400, no FK 500)', async () => {
      academicService.getCareerById.mockResolvedValueOnce(null);
      const { status, body } = await callPut({
        userId: 'user-1',
        body: { careerId: VALID_CAREER_ID },
      });
      expect(status).toBe(400);
      expect(body.success).toBe(false);
      expect(userService.updateUser).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Privilege escalation attempts (the security regression we're guarding)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('rejects mass-assignment on privilege fields', () => {
    const PRIVILEGE_FIELDS = [
      { role: 'ADMIN' },
      { isTutorApproved: true },
      { isTutorRequested: true },
      { isEmailVerified: true },
      { isActive: false },
      { suspendedAt: new Date().toISOString() },
      { profilePictureUrl: 'https://evil.com/pwn.jpg' },
      { verificationToken: 'forged-token' },
      { resetToken: 'forged-token' },
      { passwordHash: 'attacker-controlled' },
      { googleId: 'attacker-google-id' },
      { authProvider: 'Google' },
    ];

    test.each(PRIVILEGE_FIELDS)('rejects %p', async (extra) => {
      const { status, body } = await callPut({
        userId: 'user-1',
        body: { name: 'Felipe', ...extra },
      });
      expect(status).toBe(400);
      expect(body.success).toBe(false);
      // Service must NOT be called when validation fails.
      expect(userService.updateUser).not.toHaveBeenCalled();
    });

    it('rejects an unknown field even when the rest is valid', async () => {
      const { status } = await callPut({
        userId: 'user-1',
        body: { name: 'Felipe', favoriteColor: 'orange' },
      });
      expect(status).toBe(400);
      expect(userService.updateUser).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Validation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('field validation', () => {
    it('rejects empty body', async () => {
      const { status, body } = await callPut({ userId: 'user-1', body: {} });
      expect(status).toBe(400);
      expect(body.success).toBe(false);
      expect(userService.updateUser).not.toHaveBeenCalled();
    });

    it('rejects malformed JSON', async () => {
      const { status } = await callPut({
        userId: 'user-1',
        body: '{not json',
        raw: true,
      });
      expect(status).toBe(400);
      expect(userService.updateUser).not.toHaveBeenCalled();
    });

    it('rejects empty name', async () => {
      const { status } = await callPut({
        userId: 'user-1',
        body: { name: '   ' },
      });
      expect(status).toBe(400);
      expect(userService.updateUser).not.toHaveBeenCalled();
    });

    it('rejects name over the length cap', async () => {
      const { status } = await callPut({
        userId: 'user-1',
        body: { name: 'x'.repeat(121) },
      });
      expect(status).toBe(400);
      expect(userService.updateUser).not.toHaveBeenCalled();
    });

    it('rejects non-string name', async () => {
      const { status } = await callPut({
        userId: 'user-1',
        body: { name: 12345 },
      });
      expect(status).toBe(400);
      expect(userService.updateUser).not.toHaveBeenCalled();
    });

    it('normalizes empty-string phoneNumber to null (backwards compat)', async () => {
      // The existing edit-profile form sends '' when the user has no phone.
      // Coerce to null on the server so we don't break that flow.
      const { status } = await callPut({
        userId: 'user-1',
        body: { phoneNumber: '' },
      });
      expect(status).toBe(200);
      expect(userService.updateUser).toHaveBeenCalledWith('user-1', { phoneNumber: null });
    });

    it('normalizes whitespace-only phoneNumber to null', async () => {
      const { status } = await callPut({
        userId: 'user-1',
        body: { phoneNumber: '   ' },
      });
      expect(status).toBe(200);
      expect(userService.updateUser).toHaveBeenCalledWith('user-1', { phoneNumber: null });
    });

    it('rejects phoneNumber over the length cap', async () => {
      const { status } = await callPut({
        userId: 'user-1',
        body: { phoneNumber: 'x'.repeat(31) },
      });
      expect(status).toBe(400);
      expect(userService.updateUser).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Authorization (regression coverage — these checks already existed)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('authorization', () => {
    it('returns 401 without a token', async () => {
      const req = new Request('http://localhost/api/users/user-1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Felipe' }),
      });
      const res = await PUT(req, { params: Promise.resolve({ id: 'user-1' }) });
      expect(res.status).toBe(401);
      expect(userService.updateUser).not.toHaveBeenCalled();
    });

    it('returns 403 when trying to update another user', async () => {
      const { status } = await callPut({
        userId: 'user-2',
        asUser: 'user-1',
        body: { name: 'Felipe' },
      });
      expect(status).toBe(403);
      expect(userService.updateUser).not.toHaveBeenCalled();
    });
  });
});
