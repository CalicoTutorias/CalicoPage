/**
 * Unit tests for profile-picture.service.js
 *
 * All external dependencies (S3, Prisma, repositories) are mocked.
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────
// NOTE: jest.mock factories are hoisted above any top-level `const`, so the
// `send` spy is defined *inside* the factory and exposed back to the test
// suite via the mocked module (`buildS3Client().send`).

jest.mock('../../s3', () => {
  const send = jest.fn().mockResolvedValue({});
  return {
    __send: send,
    generateUploadUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/presigned-put-url'),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    headObject: jest.fn().mockResolvedValue({
      contentLength: 80_000,
      contentType: 'image/webp',
      etag: '"abc"',
    }),
    getPublicUrl: jest.fn((key) => `https://bucket.s3.us-east-1.amazonaws.com/${key}`),
    buildS3Client: jest.fn(() => ({ send })),
  };
});

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn().mockResolvedValue({}) })),
  PutObjectTaggingCommand: jest.fn((input) => ({ __command: 'PutObjectTagging', input })),
}));

jest.mock('../../repositories/user.repository', () => ({
  findById: jest.fn().mockResolvedValue({ id: 'user-1', profilePictureUrl: null }),
  update: jest.fn().mockImplementation((id, data) => Promise.resolve({ id, ...data })),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import {
  generateProfilePictureUploadUrl,
  confirmProfilePicture,
  deleteProfilePicture,
  __testing,
} from '../profile-picture.service';

import * as s3Module from '../../s3';
import { generateUploadUrl, deleteObject, headObject, getPublicUrl } from '../../s3';
import * as userRepo from '../../repositories/user.repository';

// Grab the `send` spy that the s3 mock factory installed.
const mockSend = s3Module.__send;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('profile-picture.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    userRepo.findById.mockResolvedValue({ id: 'user-1', profilePictureUrl: null });
    headObject.mockResolvedValue({
      contentLength: 80_000,
      contentType: 'image/webp',
      etag: '"abc"',
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // generateProfilePictureUploadUrl
  // ═══════════════════════════════════════════════════════════════════════════

  describe('generateProfilePictureUploadUrl', () => {
    const VALID = { mimeType: 'image/webp', fileSize: 80_000 };

    it('throws UNAUTHORIZED when userId is missing', async () => {
      await expect(generateProfilePictureUploadUrl(null, VALID))
        .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('throws VALIDATION_ERROR for disallowed mime types', async () => {
      await expect(
        generateProfilePictureUploadUrl('user-1', { mimeType: 'image/gif', fileSize: 1000 }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('throws VALIDATION_ERROR for non-positive sizes', async () => {
      await expect(
        generateProfilePictureUploadUrl('user-1', { mimeType: 'image/png', fileSize: 0 }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('throws VALIDATION_ERROR when size exceeds the cap', async () => {
      await expect(
        generateProfilePictureUploadUrl('user-1', {
          mimeType: 'image/png',
          fileSize: __testing.MAX_FILE_SIZE + 1,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('generates a presigned URL with the user-scoped prefix', async () => {
      const result = await generateProfilePictureUploadUrl('user-1', VALID);

      expect(result.uploadUrl).toBe('https://s3.amazonaws.com/presigned-put-url');
      expect(result.s3Key).toMatch(/^profile-pictures\/user-1\/[a-f0-9-]+\.webp$/);

      // Presign was called with the right shape (size bound + unconfirmed tag).
      expect(generateUploadUrl).toHaveBeenCalledWith(
        expect.stringMatching(/^profile-pictures\/user-1\//),
        'image/webp',
        expect.objectContaining({ contentLength: 80_000, tagging: 'status=unconfirmed' }),
      );
    });

    it('picks the right extension per mime type', async () => {
      const png = await generateProfilePictureUploadUrl('user-1', {
        mimeType: 'image/png',
        fileSize: 1000,
      });
      const jpg = await generateProfilePictureUploadUrl('user-1', {
        mimeType: 'image/jpeg',
        fileSize: 1000,
      });
      expect(png.s3Key.endsWith('.png')).toBe(true);
      expect(jpg.s3Key.endsWith('.jpg')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // confirmProfilePicture
  // ═══════════════════════════════════════════════════════════════════════════

  describe('confirmProfilePicture', () => {
    const KEY = 'profile-pictures/user-1/abc.webp';

    it('throws UNAUTHORIZED without a userId', async () => {
      await expect(confirmProfilePicture(null, KEY))
        .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('throws FORBIDDEN when the key belongs to another user', async () => {
      await expect(
        confirmProfilePicture('user-1', 'profile-pictures/user-2/abc.webp'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('throws NOT_FOUND when the object is not in S3', async () => {
      const notFound = Object.assign(new Error('missing'), { code: 'NOT_FOUND' });
      headObject.mockRejectedValueOnce(notFound);

      await expect(confirmProfilePicture('user-1', KEY))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('rejects mismatched content-type from the actual S3 object', async () => {
      headObject.mockResolvedValueOnce({
        contentLength: 1000,
        contentType: 'application/pdf',
      });
      await expect(confirmProfilePicture('user-1', KEY))
        .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects oversized content-length from the actual S3 object', async () => {
      headObject.mockResolvedValueOnce({
        contentLength: __testing.MAX_FILE_SIZE + 1,
        contentType: 'image/webp',
      });
      await expect(confirmProfilePicture('user-1', KEY))
        .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('persists the new public URL on the user and confirms the S3 tag', async () => {
      const result = await confirmProfilePicture('user-1', KEY);

      expect(result.profilePictureUrl).toBe(
        `https://bucket.s3.us-east-1.amazonaws.com/${KEY}`,
      );
      expect(userRepo.update).toHaveBeenCalledWith('user-1', {
        profilePictureUrl: `https://bucket.s3.us-east-1.amazonaws.com/${KEY}`,
      });

      // The tag-confirmation send() is fire-and-forget; flush microtasks so
      // we can assert it ran.
      await Promise.resolve();
      expect(mockSend).toHaveBeenCalled();
    });

    it('deletes the previous picture when it lives under our prefix', async () => {
      userRepo.findById.mockResolvedValueOnce({
        id: 'user-1',
        profilePictureUrl: 'https://bucket.s3.us-east-1.amazonaws.com/profile-pictures/user-1/old.webp',
      });

      await confirmProfilePicture('user-1', KEY);
      await Promise.resolve();

      expect(deleteObject).toHaveBeenCalledWith('profile-pictures/user-1/old.webp');
    });

    it('does NOT delete external (e.g. Google OAuth) avatar URLs', async () => {
      userRepo.findById.mockResolvedValueOnce({
        id: 'user-1',
        profilePictureUrl: 'https://lh3.googleusercontent.com/a/some-google-avatar',
      });

      await confirmProfilePicture('user-1', KEY);
      await Promise.resolve();

      expect(deleteObject).not.toHaveBeenCalled();
    });

    it('does NOT delete itself when previous and new keys match', async () => {
      userRepo.findById.mockResolvedValueOnce({
        id: 'user-1',
        profilePictureUrl: `https://bucket.s3.us-east-1.amazonaws.com/${KEY}`,
      });

      await confirmProfilePicture('user-1', KEY);
      await Promise.resolve();

      expect(deleteObject).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // deleteProfilePicture
  // ═══════════════════════════════════════════════════════════════════════════

  describe('deleteProfilePicture', () => {
    it('throws UNAUTHORIZED without a userId', async () => {
      await expect(deleteProfilePicture(null))
        .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('clears the field and deletes the S3 object', async () => {
      userRepo.findById.mockResolvedValueOnce({
        id: 'user-1',
        profilePictureUrl: 'https://bucket.s3.us-east-1.amazonaws.com/profile-pictures/user-1/x.webp',
      });

      const result = await deleteProfilePicture('user-1');

      expect(result.profilePictureUrl).toBeNull();
      expect(userRepo.update).toHaveBeenCalledWith('user-1', { profilePictureUrl: null });
      expect(deleteObject).toHaveBeenCalledWith('profile-pictures/user-1/x.webp');
    });

    it('clears the field even when there is no S3 object to delete', async () => {
      userRepo.findById.mockResolvedValueOnce({ id: 'user-1', profilePictureUrl: null });

      await deleteProfilePicture('user-1');

      expect(userRepo.update).toHaveBeenCalledWith('user-1', { profilePictureUrl: null });
      expect(deleteObject).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // keyFromStoredUrl helper
  // ═══════════════════════════════════════════════════════════════════════════

  describe('keyFromStoredUrl', () => {
    it('extracts the key from a public S3 URL', () => {
      expect(__testing.keyFromStoredUrl(
        'https://bucket.s3.us-east-1.amazonaws.com/profile-pictures/u/a.webp',
      )).toBe('profile-pictures/u/a.webp');
    });

    it('returns null for non-S3 URLs (Google OAuth, etc.)', () => {
      expect(__testing.keyFromStoredUrl('https://lh3.googleusercontent.com/a/x')).toBeNull();
    });

    it('returns null for null/empty input', () => {
      expect(__testing.keyFromStoredUrl(null)).toBeNull();
      expect(__testing.keyFromStoredUrl('')).toBeNull();
    });
  });
});
