/**
 * Tests for useFileUpload hook
 *
 * Validates client-side validation logic: MIME types, file sizes, max count.
 * API calls are mocked — the hook should NEVER call the API for invalid files.
 */

import { renderHook, act } from '@testing-library/react';
import { useFileUpload } from '../useFileUpload';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@/app/services/authFetch', () => ({
  authFetch: jest.fn(),
}));

import { authFetch } from '@/app/services/authFetch';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createFile(name, type, sizeBytes) {
  const buffer = new ArrayBuffer(Math.min(sizeBytes, 64)); // actual buffer is small, size is spoofed
  const file = new File([buffer], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useFileUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Client-side Validation ──────────────────────────────────────────────

  describe('addFiles — client-side validation', () => {
    it('accepts valid PDF file', () => {
      const { result } = renderHook(() => useFileUpload());

      let outcome;
      act(() => {
        outcome = result.current.addFiles([createFile('notes.pdf', 'application/pdf', 5000)]);
      });

      expect(outcome.accepted).toEqual(['notes.pdf']);
      expect(outcome.rejected).toEqual([]);
      expect(result.current.files).toHaveLength(1);
      expect(result.current.files[0].status).toBe('pending');
    });

    it('accepts valid image files (PNG, JPG)', () => {
      const { result } = renderHook(() => useFileUpload());

      act(() => {
        result.current.addFiles([
          createFile('photo.png', 'image/png', 2000),
          createFile('pic.jpeg', 'image/jpeg', 3000),
        ]);
      });

      expect(result.current.files).toHaveLength(2);
    });

    it('rejects file with disallowed MIME type', () => {
      const { result } = renderHook(() => useFileUpload());

      let outcome;
      act(() => {
        outcome = result.current.addFiles([createFile('hack.exe', 'application/x-msdownload', 100)]);
      });

      expect(outcome.accepted).toEqual([]);
      expect(outcome.rejected).toHaveLength(1);
      expect(outcome.rejected[0].error).toContain('no permitido');
      expect(result.current.files).toHaveLength(0);
    });

    it('rejects file exceeding 10 MB', () => {
      const { result } = renderHook(() => useFileUpload());

      let outcome;
      act(() => {
        outcome = result.current.addFiles([
          createFile('huge.pdf', 'application/pdf', 11 * 1024 * 1024),
        ]);
      });

      expect(outcome.accepted).toEqual([]);
      expect(outcome.rejected).toHaveLength(1);
      expect(outcome.rejected[0].error).toContain('10 MB');
      expect(result.current.files).toHaveLength(0);
    });

    it('rejects files beyond the max count of 5', () => {
      const { result } = renderHook(() => useFileUpload());

      // Add 5 valid files
      act(() => {
        const fiveFiles = Array.from({ length: 5 }, (_, i) =>
          createFile(`file${i}.pdf`, 'application/pdf', 100),
        );
        result.current.addFiles(fiveFiles);
      });

      expect(result.current.files).toHaveLength(5);

      // Try to add a 6th
      let outcome;
      act(() => {
        outcome = result.current.addFiles([createFile('sixth.pdf', 'application/pdf', 100)]);
      });

      expect(outcome.accepted).toEqual([]);
      expect(outcome.rejected).toHaveLength(1);
      expect(outcome.rejected[0].error).toContain('5');
      expect(result.current.files).toHaveLength(5);
    });

    it('partially accepts when adding a mix of valid and invalid files', () => {
      const { result } = renderHook(() => useFileUpload());

      let outcome;
      act(() => {
        outcome = result.current.addFiles([
          createFile('good.pdf', 'application/pdf', 1000),
          createFile('bad.exe', 'application/x-msdownload', 500),
          createFile('also-good.png', 'image/png', 2000),
        ]);
      });

      expect(outcome.accepted).toEqual(['good.pdf', 'also-good.png']);
      expect(outcome.rejected).toHaveLength(1);
      expect(outcome.rejected[0].name).toBe('bad.exe');
      expect(result.current.files).toHaveLength(2);
    });
  });

  // ─── uploadToSession — API not called without pending files ────────────

  describe('uploadToSession — no API call when no pending files', () => {
    it('does NOT call API when all files were rejected at validation', () => {
      const { result } = renderHook(() => useFileUpload());

      let outcome;
      act(() => {
        outcome = result.current.addFiles([createFile('bad.exe', 'application/x-msdownload', 100)]);
      });

      expect(outcome.rejected).toHaveLength(1);
      expect(result.current.files).toHaveLength(0);
      expect(authFetch).not.toHaveBeenCalled();
    });

    it('does NOT call API when file list is empty', async () => {
      const { result } = renderHook(() => useFileUpload());

      let response;
      await act(async () => {
        response = await result.current.uploadToSession('session-1');
      });

      expect(response.ok).toBe(true);
      expect(response.registered).toEqual([]);
      expect(authFetch).not.toHaveBeenCalled();
    });

    it('returns error when sessionId is missing', async () => {
      const { result } = renderHook(() => useFileUpload());

      let response;
      await act(async () => {
        response = await result.current.uploadToSession();
      });

      expect(response.ok).toBe(false);
      expect(response.error).toContain('sessionId');
    });
  });

  // ─── removeFile ──────────────────────────────────────────────────────────

  describe('removeFile', () => {
    it('removes a file from the queue', () => {
      const { result } = renderHook(() => useFileUpload());

      act(() => {
        result.current.addFiles([createFile('notes.pdf', 'application/pdf', 100)]);
      });

      const fileId = result.current.files[0].id;

      act(() => {
        result.current.removeFile(fileId);
      });

      expect(result.current.files).toHaveLength(0);
    });
  });

  // ─── uploadedFiles ──────────────────────────────────────────────────────

  describe('uploadedFiles', () => {
    it('returns empty when no files have been uploaded', () => {
      const { result } = renderHook(() => useFileUpload());

      act(() => {
        result.current.addFiles([createFile('notes.pdf', 'application/pdf', 100)]);
      });

      // File is still in 'pending' status
      expect(result.current.uploadedFiles).toEqual([]);
    });
  });

  // ─── isUploading ─────────────────────────────────────────────────────────

  describe('isUploading', () => {
    it('is false when no uploads are in progress', () => {
      const { result } = renderHook(() => useFileUpload());

      expect(result.current.isUploading).toBe(false);

      act(() => {
        result.current.addFiles([createFile('notes.pdf', 'application/pdf', 100)]);
      });

      // Files are 'pending', not 'uploading'
      expect(result.current.isUploading).toBe(false);
    });
  });

  // ─── uploadFiles return value ─────────────────────────────────────────────
  //
  // Regression for the stale-closure bug where the booking flow read
  // `fileUpload.uploadedFiles` right after awaiting uploadFiles(). That derived
  // value reflects the render BEFORE the upload finished (files still pending),
  // so attachments were silently dropped from the Wompi payment and never
  // registered → "No se adjuntaron archivos" on the history page. uploadFiles()
  // must therefore RETURN the fresh metadata for the caller to use directly.

  describe('uploadFiles — returns fresh attachment metadata', () => {
    let OriginalXHR;

    beforeEach(() => {
      OriginalXHR = global.XMLHttpRequest;
      // Fake XHR whose PUT always succeeds asynchronously.
      global.XMLHttpRequest = class {
        constructor() {
          this.upload = { addEventListener: () => {} };
          this._listeners = {};
          this.status = 200;
        }
        addEventListener(type, cb) { this._listeners[type] = cb; }
        open() {}
        setRequestHeader() {}
        send() {
          Promise.resolve().then(() => {
            this.status = 200;
            this._listeners.load && this._listeners.load();
          });
        }
      };
    });

    afterEach(() => {
      global.XMLHttpRequest = OriginalXHR;
    });

    it('resolves to the just-uploaded files (not the stale render value)', async () => {
      authFetch.mockResolvedValue({
        ok: true,
        data: {
          success: true,
          urls: [
            {
              s3Key: 'session-attachments/algebra-lineal/2026-06/batch/notes-abc.pdf',
              uploadUrl: 'https://s3.example/put',
              fileName: 'notes.pdf',
            },
          ],
        },
      });

      const { result } = renderHook(() => useFileUpload({ subject: 'Algebra Lineal' }));

      act(() => {
        result.current.addFiles([createFile('notes.pdf', 'application/pdf', 5000)]);
      });

      let returned;
      await act(async () => {
        returned = await result.current.uploadFiles();
      });

      // The RETURN value is what the booking flow must send to the payment.
      expect(returned).toEqual([
        {
          s3Key: 'session-attachments/algebra-lineal/2026-06/batch/notes-abc.pdf',
          fileName: 'notes.pdf',
          fileSize: 5000,
          mimeType: 'application/pdf',
        },
      ]);
      // And after the state flush the derived value agrees.
      expect(result.current.uploadedFiles).toEqual(returned);
    });

    it('returns an empty array (and skips the API) when there are no files', async () => {
      const { result } = renderHook(() => useFileUpload({ subject: 'Algebra' }));

      let returned;
      await act(async () => {
        returned = await result.current.uploadFiles();
      });

      expect(returned).toEqual([]);
      expect(authFetch).not.toHaveBeenCalled();
    });

    it('uses a provided getUploadUrls (session-scoped) instead of the default endpoint', async () => {
      const getUploadUrls = jest.fn().mockResolvedValue({
        ok: true,
        data: {
          success: true,
          urls: [
            {
              s3Key: 'session-attachments/algebra/2026-06/batch/extra-xyz.pdf',
              uploadUrl: 'https://s3.example/put',
              fileName: 'extra.pdf',
            },
          ],
        },
      });

      const { result } = renderHook(() => useFileUpload({ getUploadUrls }));

      act(() => {
        result.current.addFiles([createFile('extra.pdf', 'application/pdf', 2048)]);
      });

      let returned;
      await act(async () => {
        returned = await result.current.uploadFiles();
      });

      expect(getUploadUrls).toHaveBeenCalledWith([
        { fileName: 'extra.pdf', mimeType: 'application/pdf', fileSize: 2048 },
      ]);
      // The default subject-scoped endpoint must NOT be hit.
      expect(authFetch).not.toHaveBeenCalled();
      expect(returned).toEqual([
        {
          s3Key: 'session-attachments/algebra/2026-06/batch/extra-xyz.pdf',
          fileName: 'extra.pdf',
          fileSize: 2048,
          mimeType: 'application/pdf',
        },
      ]);
    });
  });

  // ─── reset ─────────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears the queue', () => {
      const { result } = renderHook(() => useFileUpload());

      act(() => {
        result.current.addFiles([createFile('notes.pdf', 'application/pdf', 100)]);
      });
      expect(result.current.files).toHaveLength(1);

      act(() => {
        result.current.reset();
      });
      expect(result.current.files).toHaveLength(0);
    });
  });
});
