/**
 * Integration tests for POST /api/attachments/presigned-urls
 *
 * Tests Zod validation, auth enforcement, and happy path.
 * All S3 and service calls are mocked — zero real AWS/DB interaction.
 *
 * @jest-environment node
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
}));

jest.mock('@/lib/services/session-attachment.service', () => ({
  generateUploadUrls: jest.fn(),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { POST } from '../route';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as attachmentService from '@/lib/services/session-attachment.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body) {
  return {
    json: async () => body,
    headers: new Headers({ Authorization: 'Bearer test-token' }),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/attachments/presigned-urls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: authenticated user
    authenticateRequest.mockReturnValue({ sub: 1, email: 'student@test.com' });
  });

  // ─── Auth ────────────────────────────────────────────────────────────────

  describe('Authentication', () => {
    it('returns 401 when no session/token', async () => {
      const unauthorized = NextResponse.json({ error: 'Missing or malformed Authorization header' }, { status: 401 });
      authenticateRequest.mockReturnValue(unauthorized);

      const response = await POST(makeRequest({ files: [] }));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Authorization');
    });
  });

  // ─── Zod Validation ─────────────────────────────────────────────────────

  describe('Zod Validation', () => {
    it('rejects file exceeding 10 MB', async () => {
      const response = await POST(
        makeRequest({
          files: [{ fileName: 'big.pdf', mimeType: 'application/pdf', fileSize: 15 * 1024 * 1024 }],
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    it('rejects disallowed MIME type (.exe)', async () => {
      const response = await POST(
        makeRequest({
          files: [{ fileName: 'virus.exe', mimeType: 'application/x-msdownload', fileSize: 1000 }],
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('no permitido');
    });

    it('rejects empty files array', async () => {
      const response = await POST(makeRequest({ files: [] }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('rejects more than 5 files', async () => {
      const files = Array(6).fill({ fileName: 'f.pdf', mimeType: 'application/pdf', fileSize: 100 });
      const response = await POST(makeRequest({ files }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('5');
    });

    it('rejects zero-size file', async () => {
      const response = await POST(
        makeRequest({
          files: [{ fileName: 'empty.pdf', mimeType: 'application/pdf', fileSize: 0 }],
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
    });

    it('rejects missing fileName', async () => {
      const response = await POST(
        makeRequest({
          files: [{ mimeType: 'application/pdf', fileSize: 100 }],
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
    });
  });

  // ─── Happy Path ──────────────────────────────────────────────────────────

  describe('Happy Path', () => {
    it('returns presigned URLs for valid files', async () => {
      attachmentService.generateUploadUrls.mockResolvedValue({
        batchId: 'batch-123',
        urls: [
          { s3Key: 'session-attachments/batch-123/123-notes.pdf', uploadUrl: 'https://s3/presigned', fileName: 'notes.pdf' },
        ],
      });

      const response = await POST(
        makeRequest({
          files: [{ fileName: 'notes.pdf', mimeType: 'application/pdf', fileSize: 5000 }],
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.batchId).toBe('batch-123');
      expect(data.urls).toHaveLength(1);
      expect(data.urls[0].s3Key).toContain('notes.pdf');
    });

    it('accepts all valid MIME types', async () => {
      const validTypes = [
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/jpg',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];

      attachmentService.generateUploadUrls.mockResolvedValue({ batchId: 'b', urls: [] });

      for (const mimeType of validTypes) {
        const response = await POST(
          makeRequest({
            files: [{ fileName: 'file.test', mimeType, fileSize: 100 }],
          }),
        );
        expect(response.status).toBe(200);
      }
    });
  });

  // ─── Service Error Handling ──────────────────────────────────────────────

  describe('Service Errors', () => {
    it('returns 400 for VALIDATION_ERROR from service', async () => {
      const err = new Error('Custom validation error');
      err.code = 'VALIDATION_ERROR';
      attachmentService.generateUploadUrls.mockRejectedValue(err);

      const response = await POST(
        makeRequest({
          files: [{ fileName: 'f.pdf', mimeType: 'application/pdf', fileSize: 100 }],
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Custom validation error');
    });

    it('returns 500 for unexpected errors', async () => {
      attachmentService.generateUploadUrls.mockRejectedValue(new Error('S3 down'));

      const response = await POST(
        makeRequest({
          files: [{ fileName: 'f.pdf', mimeType: 'application/pdf', fileSize: 100 }],
        }),
      );
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });
});
