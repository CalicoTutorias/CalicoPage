/**
 * Unit tests for session-attachment.service.js
 *
 * All external dependencies (S3, Prisma, repositories) are mocked.
 * Zero real network or database calls.
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../../s3', () => ({
  buildS3Client: jest.fn(),
  generateUploadUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/presigned-put-url'),
  generateDownloadUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/presigned-get-url'),
  deleteObject: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  PutObjectTaggingCommand: jest.fn(),
}));

jest.mock('../../repositories/session-attachment.repository', () => ({
  createMany: jest.fn().mockResolvedValue([
    { id: 'att-1', sessionId: 'session-1', s3Key: 'key-1', fileName: 'file.pdf', fileSize: 1024, mimeType: 'application/pdf' },
  ]),
  findBySessionId: jest.fn().mockResolvedValue([]),
  deleteBySessionId: jest.fn().mockResolvedValue({ count: 0 }),
}));

jest.mock('../../repositories/session.repository', () => ({
  findById: jest.fn().mockResolvedValue(null),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import {
  generateUploadUrls,
  registerAttachments,
  getAuthorizedDownloadUrls,
  cleanupOrphanedFiles,
  deleteSessionAttachments,
} from '../session-attachment.service';

import { generateUploadUrl, generateDownloadUrl, deleteObject } from '../../s3';
import * as attachmentRepo from '../../repositories/session-attachment.repository';
import * as sessionRepo from '../../repositories/session.repository';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_FILES = [
  { fileName: 'notes.pdf', mimeType: 'application/pdf', fileSize: 5000 },
  { fileName: 'diagram.png', mimeType: 'image/png', fileSize: 2000 },
];

function mockSession({ tutorId = 10, status = 'Pending', participants = [] } = {}) {
  return {
    id: 'session-1',
    tutorId,
    status,
    participants,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('session-attachment.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // generateUploadUrls
  // ═══════════════════════════════════════════════════════════════════════════

  describe('generateUploadUrls', () => {
    it('returns batchId and presigned URLs for valid files', async () => {
      const result = await generateUploadUrls(VALID_FILES);

      expect(result.batchId).toBeDefined();
      expect(typeof result.batchId).toBe('string');
      expect(result.batchId.length).toBeGreaterThan(0);

      expect(result.urls).toHaveLength(2);
      expect(result.urls[0]).toMatchObject({
        s3Key: expect.stringContaining('session-attachments/'),
        uploadUrl: 'https://s3.amazonaws.com/presigned-put-url',
        fileName: 'notes.pdf',
      });
      expect(result.urls[1].fileName).toBe('diagram.png');

      // Verify S3 was called with contentLength and tagging options
      expect(generateUploadUrl).toHaveBeenCalledTimes(2);
      expect(generateUploadUrl).toHaveBeenCalledWith(
        expect.stringContaining('session-attachments/'),
        'application/pdf',
        { contentLength: 5000, tagging: 'status=unconfirmed' },
      );
    });

    it('sanitizes filenames in S3 keys', async () => {
      const files = [{ fileName: '../../../etc/passwd.pdf', mimeType: 'application/pdf', fileSize: 100 }];
      const result = await generateUploadUrls(files);

      // Path traversal chars should be replaced with underscores
      const s3Key = result.urls[0].s3Key;
      expect(s3Key).not.toContain('..');
      expect(s3Key).not.toContain('/etc/');
      expect(s3Key).toContain('session-attachments/');
    });

    it('rejects empty file array', async () => {
      await expect(generateUploadUrls([])).rejects.toThrow('al menos un archivo');
    });

    it('rejects more than 5 files', async () => {
      const tooMany = Array(6).fill(VALID_FILES[0]);
      await expect(generateUploadUrls(tooMany)).rejects.toThrow('Máximo 5');
    });

    it('rejects disallowed MIME type', async () => {
      const bad = [{ fileName: 'hack.exe', mimeType: 'application/x-msdownload', fileSize: 100 }];
      await expect(generateUploadUrls(bad)).rejects.toThrow('no permitido');
    });

    it('rejects file exceeding 10 MB', async () => {
      const big = [{ fileName: 'big.pdf', mimeType: 'application/pdf', fileSize: 11 * 1024 * 1024 }];
      await expect(generateUploadUrls(big)).rejects.toThrow('10 MB');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // registerAttachments
  // ═══════════════════════════════════════════════════════════════════════════

  describe('registerAttachments', () => {
    it('creates DB records and triggers S3 tag confirmation', async () => {
      const meta = [{ s3Key: 'key-1', fileName: 'file.pdf', fileSize: 1024, mimeType: 'application/pdf' }];

      const result = await registerAttachments('session-1', meta);

      expect(attachmentRepo.createMany).toHaveBeenCalledWith('session-1', meta);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('att-1');
    });

    it('returns empty array when no attachments provided', async () => {
      const result = await registerAttachments('session-1', []);
      expect(result).toEqual([]);
      expect(attachmentRepo.createMany).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getAuthorizedDownloadUrls — ACCESS CONTROL MATRIX
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getAuthorizedDownloadUrls', () => {
    const STUDENT_ID = 1;
    const TUTOR_ID = 10;
    const OTHER_USER_ID = 99;

    const attachmentRecords = [
      { id: 'att-1', s3Key: 'key-1', fileName: 'notes.pdf', fileSize: 5000, mimeType: 'application/pdf', uploadedAt: new Date() },
    ];

    beforeEach(() => {
      attachmentRepo.findBySessionId.mockResolvedValue(attachmentRecords);
    });

    it('ALLOWS student creator — always', async () => {
      sessionRepo.findById.mockResolvedValue(
        mockSession({ tutorId: TUTOR_ID, status: 'Accepted', participants: [{ studentId: STUDENT_ID }] }),
      );

      const result = await getAuthorizedDownloadUrls('session-1', STUDENT_ID);

      expect(result.authorized).toBe(true);
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0].downloadUrl).toBe('https://s3.amazonaws.com/presigned-get-url');
      expect(generateDownloadUrl).toHaveBeenCalledWith('key-1', 900); // 15 min expiry
    });

    it('ALLOWS assigned tutor on Pending session', async () => {
      sessionRepo.findById.mockResolvedValue(
        mockSession({ tutorId: TUTOR_ID, status: 'Pending', participants: [{ studentId: STUDENT_ID }] }),
      );

      const result = await getAuthorizedDownloadUrls('session-1', TUTOR_ID);

      expect(result.authorized).toBe(true);
      expect(result.attachments).toHaveLength(1);
    });

    it('ALLOWS assigned tutor on Accepted session', async () => {
      sessionRepo.findById.mockResolvedValue(
        mockSession({ tutorId: TUTOR_ID, status: 'Accepted', participants: [{ studentId: STUDENT_ID }] }),
      );

      const result = await getAuthorizedDownloadUrls('session-1', TUTOR_ID);

      expect(result.authorized).toBe(true);
    });

    it('DENIES assigned tutor on Rejected session', async () => {
      sessionRepo.findById.mockResolvedValue(
        mockSession({ tutorId: TUTOR_ID, status: 'Rejected', participants: [{ studentId: STUDENT_ID }] }),
      );

      const result = await getAuthorizedDownloadUrls('session-1', TUTOR_ID);

      expect(result.authorized).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.attachments).toBeUndefined();
    });

    it('DENIES assigned tutor on Canceled session', async () => {
      sessionRepo.findById.mockResolvedValue(
        mockSession({ tutorId: TUTOR_ID, status: 'Canceled', participants: [{ studentId: STUDENT_ID }] }),
      );

      const result = await getAuthorizedDownloadUrls('session-1', TUTOR_ID);

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('cancelada');
    });

    it('DENIES a different tutor (not assigned)', async () => {
      sessionRepo.findById.mockResolvedValue(
        mockSession({ tutorId: TUTOR_ID, status: 'Pending', participants: [{ studentId: STUDENT_ID }] }),
      );

      const result = await getAuthorizedDownloadUrls('session-1', OTHER_USER_ID);

      expect(result.authorized).toBe(false);
    });

    it('throws NOT_FOUND for non-existent session', async () => {
      sessionRepo.findById.mockResolvedValue(null);

      await expect(getAuthorizedDownloadUrls('nonexistent', STUDENT_ID)).rejects.toThrow('no encontrada');
    });

    it('returns empty array when session has no attachments', async () => {
      sessionRepo.findById.mockResolvedValue(
        mockSession({ tutorId: TUTOR_ID, status: 'Pending', participants: [{ studentId: STUDENT_ID }] }),
      );
      attachmentRepo.findBySessionId.mockResolvedValue([]);

      const result = await getAuthorizedDownloadUrls('session-1', TUTOR_ID);

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
      expect(deleteObject).toHaveBeenCalledWith('key-1');
      expect(deleteObject).toHaveBeenCalledWith('key-2');
    });

    it('does NOT throw when some deletions fail (Promise.allSettled)', async () => {
      deleteObject
        .mockResolvedValueOnce(undefined) // key-1 succeeds
        .mockRejectedValueOnce(new Error('S3 network error')); // key-2 fails

      // Must NOT throw — fire-and-forget resilience
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

      await deleteSessionAttachments('session-1');

      expect(attachmentRepo.deleteBySessionId).toHaveBeenCalledWith('session-1');
      expect(deleteObject).toHaveBeenCalledTimes(2);
    });

    it('skips S3 cleanup when no attachments exist', async () => {
      attachmentRepo.findBySessionId.mockResolvedValue([]);

      await deleteSessionAttachments('session-1');

      expect(attachmentRepo.deleteBySessionId).toHaveBeenCalledWith('session-1');
      expect(deleteObject).not.toHaveBeenCalled();
    });
  });
});
