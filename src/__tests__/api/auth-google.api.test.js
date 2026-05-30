/**
 * @jest-environment node
 *
 * Tests for POST /api/auth/google — Google OAuth signin/link/register flow.
 *
 * Focus: the profile-picture-preservation contract on the account-linking
 * branch. Previously, linking would silently overwrite a custom-uploaded
 * picture (and orphan the S3 object). Now the existing picture wins;
 * Google's is only a fallback.
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@/lib/services/google-oauth.service', () => ({
  verifyGoogleToken: jest.fn(),
}));

jest.mock('@/lib/auth/jwt', () => ({
  signToken: jest.fn(() => 'test-jwt-token'),
}));

jest.mock('@/lib/repositories/user.repository', () => ({
  findByGoogleIdWithPassword: jest.fn(),
  findByEmailWithPassword: jest.fn(),
  findByIdWithPassword: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { POST } from '@/app/api/auth/google/route';
import { verifyGoogleToken } from '@/lib/services/google-oauth.service';
import * as userRepository from '@/lib/repositories/user.repository';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildRequest(body) {
  return new Request('http://localhost/api/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const GOOGLE_USER = {
  googleId: 'google-abc-123',
  email: 'felipe@calico.com',
  name: 'Felipe',
  picture: 'https://lh3.googleusercontent.com/a/some-google-avatar',
};

const S3_AVATAR =
  'https://calico-uploads.s3.us-east-1.amazonaws.com/profile-pictures/user-1/abc.webp';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/auth/google', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyGoogleToken.mockResolvedValue(GOOGLE_USER);
    // Default: no existing user anywhere.
    userRepository.findByGoogleIdWithPassword.mockResolvedValue(null);
    userRepository.findByEmailWithPassword.mockResolvedValue(null);
    // findById is used to return the safe (sanitized) user shape to the client.
    userRepository.findById.mockImplementation((id) =>
      Promise.resolve({ id, email: GOOGLE_USER.email, name: GOOGLE_USER.name }),
    );
    userRepository.findByIdWithPassword.mockImplementation((id) =>
      Promise.resolve({
        id,
        email: GOOGLE_USER.email,
        name: GOOGLE_USER.name,
        isTutorRequested: false,
        isTutorApproved: false,
      }),
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Account linking — the path we just hardened
  // ═══════════════════════════════════════════════════════════════════════════

  describe('account linking (existing email user signs in with Google)', () => {
    it('PRESERVES a custom S3 profile picture (does NOT overwrite with Google)', async () => {
      userRepository.findByEmailWithPassword.mockResolvedValue({
        id: 'user-1',
        email: GOOGLE_USER.email,
        isActive: true,
        profilePictureUrl: S3_AVATAR,
      });

      const res = await POST(buildRequest({ idToken: 'valid-token' }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.linked).toBe(true);

      // The repo update must keep the existing S3 URL — not Google's.
      expect(userRepository.update).toHaveBeenCalledWith('user-1', {
        googleId: GOOGLE_USER.googleId,
        authProvider: 'Google',
        profilePictureUrl: S3_AVATAR,
        isEmailVerified: true,
      });
    });

    it('PRESERVES a previously-set Google picture (does NOT overwrite with the new one)', async () => {
      // Edge case: user signed in with a Google account some time ago, then
      // signed out and is now linking a *different* (or same) Google account
      // to the same email. Their current picture should still win — they
      // never asked us to change it.
      const OLD_GOOGLE = 'https://lh3.googleusercontent.com/a/old-picture';
      userRepository.findByEmailWithPassword.mockResolvedValue({
        id: 'user-1',
        email: GOOGLE_USER.email,
        isActive: true,
        profilePictureUrl: OLD_GOOGLE,
      });

      await POST(buildRequest({ idToken: 'valid-token' }));

      expect(userRepository.update).toHaveBeenCalledWith('user-1', expect.objectContaining({
        profilePictureUrl: OLD_GOOGLE,
      }));
    });

    it('USES the Google picture as fallback when the user has none', async () => {
      userRepository.findByEmailWithPassword.mockResolvedValue({
        id: 'user-1',
        email: GOOGLE_USER.email,
        isActive: true,
        profilePictureUrl: null,
      });

      await POST(buildRequest({ idToken: 'valid-token' }));

      expect(userRepository.update).toHaveBeenCalledWith('user-1', expect.objectContaining({
        profilePictureUrl: GOOGLE_USER.picture,
      }));
    });

    it('leaves profilePictureUrl null when neither user nor Google has a picture', async () => {
      userRepository.findByEmailWithPassword.mockResolvedValue({
        id: 'user-1',
        email: GOOGLE_USER.email,
        isActive: true,
        profilePictureUrl: null,
      });
      verifyGoogleToken.mockResolvedValue({ ...GOOGLE_USER, picture: null });

      await POST(buildRequest({ idToken: 'valid-token' }));

      expect(userRepository.update).toHaveBeenCalledWith('user-1', expect.objectContaining({
        profilePictureUrl: null,
      }));
    });

    it('rejects linking when the existing account is disabled', async () => {
      userRepository.findByEmailWithPassword.mockResolvedValue({
        id: 'user-1',
        email: GOOGLE_USER.email,
        isActive: false,
        profilePictureUrl: S3_AVATAR,
      });

      const res = await POST(buildRequest({ idToken: 'valid-token' }));
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error).toBe('ACCOUNT_DISABLED');
      // Critical: must NOT have touched the user row in any way.
      expect(userRepository.update).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Existing Google user — must NOT touch profilePictureUrl
  // ═══════════════════════════════════════════════════════════════════════════

  describe('returning Google user', () => {
    it('logs in without touching profilePictureUrl', async () => {
      userRepository.findByGoogleIdWithPassword.mockResolvedValue({
        id: 'user-1',
        email: GOOGLE_USER.email,
        isActive: true,
        profilePictureUrl: S3_AVATAR,
        isTutorRequested: false,
        isTutorApproved: false,
      });

      const res = await POST(buildRequest({ idToken: 'valid-token' }));

      expect(res.status).toBe(200);
      // No write of any kind on returning logins — confirms a custom upload
      // is never wiped on subsequent Google sessions.
      expect(userRepository.update).not.toHaveBeenCalled();
      expect(userRepository.create).not.toHaveBeenCalled();
    });

    it('rejects a disabled returning Google account', async () => {
      userRepository.findByGoogleIdWithPassword.mockResolvedValue({
        id: 'user-1',
        email: GOOGLE_USER.email,
        isActive: false,
      });

      const res = await POST(buildRequest({ idToken: 'valid-token' }));
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error).toBe('ACCOUNT_DISABLED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Brand-new Google user — Google picture is the initial value
  // ═══════════════════════════════════════════════════════════════════════════

  describe('new Google user', () => {
    it('creates the user with the Google picture as initial profilePictureUrl', async () => {
      userRepository.create.mockResolvedValue({ id: 'user-new', email: GOOGLE_USER.email });

      const res = await POST(buildRequest({ idToken: 'valid-token' }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.isNewUser).toBe(true);
      expect(userRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        googleId: GOOGLE_USER.googleId,
        email: GOOGLE_USER.email,
        name: GOOGLE_USER.name,
        profilePictureUrl: GOOGLE_USER.picture,
        authProvider: 'Google',
        isEmailVerified: true,
        passwordHash: null,
      }));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Input validation / error paths
  // ═══════════════════════════════════════════════════════════════════════════

  describe('validation', () => {
    it('rejects missing idToken', async () => {
      const res = await POST(buildRequest({}));
      expect(res.status).toBe(400);
    });

    it('returns 401 when the Google token is invalid', async () => {
      verifyGoogleToken.mockRejectedValue(new Error('bad token'));
      const res = await POST(buildRequest({ idToken: 'bogus' }));
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error).toBe('Invalid Google token');
      expect(userRepository.update).not.toHaveBeenCalled();
      expect(userRepository.create).not.toHaveBeenCalled();
    });
  });
});
