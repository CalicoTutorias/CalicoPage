/**
 * Unit tests for session-attachment.service.js
 *
 * All external dependencies (S3, Prisma, repositories) are mocked.
 * Zero real network or database calls.
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../../s3', () => ({
  generateUploadUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/presigned-put-url'),
  generateDownloadUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/presigned-get-url'),
  deleteObject: jest.fn().mockResolvedValue(undefined),
  headObject: jest.fn(),
  setObjectTags: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../repositories/session-attachment.repository', () => ({
  createMany: jest.fn(),
  findBySessionId: jest.fn().mockResolvedValue([]),
  deleteBySessionId: jest.fn().mockResolvedValue({ count: 0 }),
}));

jest.mock('../../repositories/session.repository', () => ({
  findById: jest.fn().mockResolvedValue(null),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import {
  generateSessionUploadUrls,
  registerSessionAttachments,
  getAuthorizedDownloadUrls,
  cleanupOrphanedFiles,
  deleteSessionAttachments,
} from '../session-attachment.service';

import { generateUploadUrl, generateDownloadUrl, deleteObject, headObject, setObjectTags } from '../../s3';
import * as attachmentRepo from '../../repositories/session-attachment.repository';
import * as sessionRepo from '../../repositories/session.repository';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SESSION_ID = 'session-1';
const STUDENT_ID = 1;
const TUTOR_ID = 10;
const OTHER_USER_ID = 99;

const VALID_FILES = [
  { fileName: 'notes.pdf', mimeType: 'application/pdf', fileSize: 5000 },
  { fileName: 'diagram.png', mimeType: 'image/png', fileSize: 2000 },
];

function mockSession({ tutorId = TUTOR_ID, status = 'Accepted', participants = [{ studentId: STUDENT_ID }] } = {}) {
  return { id: SESSION_ID, tutorId, status, participants };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('session-attachment.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionRepo.findById.mockResolvedValue(mockSession());
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // generateSessionUploadUrls
  // ═══════════════════════════════════════════════════════════════════════════

  describe('generateSessionUploadUrls', () => {
    it('returns session-scoped presigned URLs for the student creator', async () => {
      const result = await generateSessionUploadUrls(SESSION_ID, STUDENT_ID, VALID_FILES);

      expect(result.urls).toHaveLength(2);
      expect(result.urls[0]).toMatchObject({
        s3Key: expect.stringContaining(`session-attachments/${SESSION_ID}/`),
        uploadUrl: 'https://s3.amazonaws.com/presigned-put-url',
        fileName: 'notes.pdf',
      });
      expect(generateUploadUrl).toHaveBeenCalledWith(
        expect.stringContaining(`session-attachments/${SESSION_ID}/`),
        'application/pdf',
        expect.objectContaining({ contentLength: 5000, tagging: 'status=unconfirmed' }),
      );
    });

    it('sanitizes filenames in S3 keys', async () => {
      const files = [{ fileName: '../../../etc/passwd.pdf', mimeType: 'application/pdf', fileSize: 100 }];
      const result = await generateSessionUploadUrls(SESSION_ID, STUDENT_ID, files);

      const s3Key = result.urls[0].s3Key;
      expect(s3Key).not.toContain('..');
      expect(s3Key).not.toContain('/etc/');
      expect(s3Key.startsWith(`session-attachments/${SESSION_ID}/`)).toBe(true);
    });

    it('throws FORBIDDEN when the requester is not the student creator', async () => {
      await expect(
        generateSessionUploadUrls(SESSION_ID, OTHER_USER_ID, VALID_FILES),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('throws NOT_FOUND when session does not exist', async () => {
      sessionRepo.findById.mockResolvedValue(null);
      await expect(
        generateSessionUploadUrls(SESSION_ID, STUDENT_ID, VALID_FILES),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('rejects empty file array', async () => {
      await expect(
        generateSessionUploadUrls(SESSION_ID, STUDENT_ID, []),
      ).rejects.toThrow('al menos un archivo');
    });

    it('rejects more than 5 files', async () => {
      const tooMany = Array(6).fill(VALID_FILES[0]);
      await expect(
        generateSessionUploadUrls(SESSION_ID, STUDENT_ID, tooMany),
      ).rejects.toThrow('Máximo 5');
    });

    it('rejects disallowed MIME type', async () => {
      const bad = [{ fileName: 'hack.exe', mimeType: 'application/x-msdownload', fileSize: 100 }];
      await expect(
        generateSessionUploadUrls(SESSION_ID, STUDENT_ID, bad),
      ).rejects.toThrow('no permitido');
    });

    it('rejects file exceeding 10 MB', async () => {
      const big = [{ fileName: 'big.pdf', mimeType: 'application/pdf', fileSize: 11 * 1024 * 1024 }];
      await expect(
        generateSessionUploadUrls(SESSION_ID, STUDENT_ID, big),
      ).rejects.toThrow('10 MB');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // registerSessionAttachments
  // ═══════════════════════════════════════════════════════════════════════════

  describe('registerSessionAttachments', () => {
    const validS3Key = `session-attachments/${SESSION_ID}/abc-notes.pdf`;
    const meta = [{ s3Key: validS3Key, fileName: 'notes.pdf', fileSize: 1024, mimeType: 'application/pdf' }];

    beforeEach(() => {
      headObject.mockResolvedValue({ contentLength: 1024, contentType: 'application/pdf' });
      attachmentRepo.createMany.mockResolvedValue([
        { id: 'att-1', sessionId: SESSION_ID, s3Key: validS3Key, fileName: 'notes.pdf', fileSize: 1024, mimeType: 'application/pdf' },
      ]);
    });

    it('creates DB records and triggers S3 tag confirmation for valid attachments', async () => {
      const result = await registerSessionAttachments(SESSION_ID, STUDENT_ID, meta);

      expect(headObject).toHaveBeenCalledWith(validS3Key);
      expect(attachmentRepo.createMany).toHaveBeenCalledWith(SESSION_ID, meta);
      expect(setObjectTags).toHaveBeenCalledWith(validS3Key, { status: 'confirmed' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('att-1');
    });

    it('throws FORBIDDEN when s3Key does not match session prefix', async () => {
      const crossSession = [{ s3Key: 'session-attachments/another-session/abc.pdf', fileName: 'x.pdf', fileSize: 1024, mimeType: 'application/pdf' }];
      await expect(
        registerSessionAttachments(SESSION_ID, STUDENT_ID, crossSession),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(attachmentRepo.createMany).not.toHaveBeenCalled();
    });

    it('throws FORBIDDEN when requester is not the student creator', async () => {
      await expect(
        registerSessionAttachments(SESSION_ID, OTHER_USER_ID, meta),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('throws NOT_FOUND when the object is missing in S3', async () => {
      const notFoundErr = Object.assign(new Error('missing'), { code: 'NOT_FOUND' });
      headObject.mockRejectedValue(notFoundErr);

      await expect(
        registerSessionAttachments(SESSION_ID, STUDENT_ID, meta),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(attachmentRepo.createMany).not.toHaveBeenCalled();
    });

    it('throws VALIDATION_ERROR when S3 size does not match declared size', async () => {
      headObject.mockResolvedValue({ contentLength: 9999, contentType: 'application/pdf' });
      await expect(
        registerSessionAttachments(SESSION_ID, STUDENT_ID, meta),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getAuthorizedDownloadUrls — ACCESS CONTROL MATRIX
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getAuthorizedDownloadUrls', () => {
    const attachmentRecords = [
      { id: 'att-1', s3Key: 'key-1', fileName: 'notes.pdf', fileSize: 5000, mimeType: 'application/pdf', uploadedAt: new Date() },
    ];

    beforeEach(() => {
      attachmentRepo.findBySessionId.mockResolvedValue(attachmentRecords);
    });

    it('ALLOWS student creator — always', async () => {
      sessionRepo.findById.mockResolvedValue(mockSession({ status: 'Accepted' }));

      const result = await getAuthorizedDownloadUrls(SESSION_ID, STUDENT_ID);

      expect(result.authorized).toBe(true);
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0].downloadUrl).toBe('https://s3.amazonaws.com/presigned-get-url');
      expect(generateDownloadUrl).toHaveBeenCalledWith('key-1', 900);
    });

    it('ALLOWS assigned tutor on Pending session', async () => {
      sessionRepo.findById.mockResolvedValue(mockSession({ status: 'Pending' }));
      const result = await getAuthorizedDownloadUrls(SESSION_ID, TUTOR_ID);
      expect(result.authorized).toBe(true);
    });

    it('ALLOWS assigned tutor on Accepted session', async () => {
      sessionRepo.findById.mockResolvedValue(mockSession({ status: 'Accepted' }));
      const result = await getAuthorizedDownloadUrls(SESSION_ID, TUTOR_ID);
      expect(result.authorized).toBe(true);
    });

    it('DENIES assigned tutor on Rejected session', async () => {
      sessionRepo.findById.mockResolvedValue(mockSession({ status: 'Rejected' }));
      const result = await getAuthorizedDownloadUrls(SESSION_ID, TUTOR_ID);
      expect(result.authorized).toBe(false);
      expect(result.attachments).toBeUndefined();
    });

    it('DENIES assigned tutor on Canceled session', async () => {
      sessionRepo.findById.mockResolvedValue(mockSession({ status: 'Canceled' }));
      const result = await getAuthorizedDownloadUrls(SESSION_ID, TUTOR_ID);
      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('cancelada');
    });

    it('DENIES a different tutor (not assigned)', async () => {
      sessionRepo.findById.mockResolvedValue(mockSession({ status: 'Pending' }));
      const result = await getAuthorizedDownloadUrls(SESSION_ID, OTHER_USER_ID);
      expect(result.authorized).toBe(false);
    });

    it('throws NOT_FOUND for non-existent session', async () => {
      sessionRepo.findById.mockResolvedValue(null);
      await expect(getAuthorizedDownloadUrls('nonexistent', STUDENT_ID)).rejects.toThrow('no encontrada');
    });

    it('returns empty array when session has no attachments', async () => {
      sessionRepo.findById.mockResolvedValue(mockSession());
      attachmentRepo.findBySessionId.mockResolvedValue([]);

      const result = await getAuthorizedDownloadUrls(SESSION_ID, TUTOR_ID);

      expect(result.authorized).toBe(true);
      expect(result.attachments).toEqual([]);
      expect(generateDownloadUrl).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // cleanupOrphanedFiles — Resilience
  // ═══════════════════════════════════════════════════════════════════════════

  describe('cleanupOrphanedFiles', () => {
    it('deletes all S3 objects', async () => {
      await cleanupOrphanedFiles(['key-1', 'key-2']);
      expect(deleteObject).toHaveBeenCalledTimes(2);
    });

    it('does NOT throw when some deletions fail (Promise.allSettled)', async () => {
      deleteObject
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('S3 network error'));

      await expect(cleanupOrphanedFiles(['key-1', 'key-2'])).resolves.toBeUndefined();
    });

    it('handles empty array gracefully', async () => {
      await cleanupOrphanedFiles([]);
      expect(deleteObject).not.toHaveBeenCalled();
    });

    it('handles null/undefined gracefully', async () => {
      await cleanupOrphanedFiles(null);
      expect(deleteObject).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // deleteSessionAttachments
  // ═══════════════════════════════════════════════════════════════════════════

  describe('deleteSessionAttachments', () => {
    it('deletes DB records then cleans S3', async () => {
      attachmentRepo.findBySessionId.mockResolvedValue([
        { id: 'att-1', s3Key: 'key-1' },
        { id: 'att-2', s3Key: 'key-2' },
      ]);

      await deleteSessionAttachments(SESSION_ID);

      expect(attachmentRepo.deleteBySessionId).toHaveBeenCalledWith(SESSION_ID);
      expect(deleteObject).toHaveBeenCalledTimes(2);
    });

    it('skips S3 cleanup when no attachments exist', async () => {
      attachmentRepo.findBySessionId.mockResolvedValue([]);
      await deleteSessionAttachments(SESSION_ID);
      expect(attachmentRepo.deleteBySessionId).toHaveBeenCalledWith(SESSION_ID);
      expect(deleteObject).not.toHaveBeenCalled();
    });
  });
});
