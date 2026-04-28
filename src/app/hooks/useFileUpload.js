'use client';

/**
 * useFileUpload — Selects and caches files locally; uploads them to S3 only
 * when the caller invokes `uploadToSession(sessionId)`, which is meant to run
 * AFTER the Wompi payment is approved and the session has been created.
 *
 * Pipeline:
 *   1. addFiles()        → client-side validation (type, size, max count)
 *   2. uploadToSession() → a) POST /api/sessions/:id/attachments/upload-urls
 *                          b) PUT each File directly to S3 with XHR progress
 *                          c) POST /api/sessions/:id/attachments/register
 *
 * Status per file: 'pending' → 'uploading' → 'success' | 'error'.
 * Returns { files, addFiles, removeFile, retryFile, uploadToSession, isUploading, isRegistering }.
 */

import { useState, useCallback, useRef } from 'react';
import { authFetch } from '@/app/services/authFetch';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 5;

/** @typedef {'pending' | 'uploading' | 'success' | 'error'} FileStatus */

function validateFile(file) {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return `"${file.name}" tiene un tipo no permitido. Usa PDF, PNG, JPG, DOC o DOCX.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `"${file.name}" excede el límite de 10 MB.`;
  }
  return null;
}

/**
 * PUT a single file to S3 using XMLHttpRequest so we can report progress.
 */
function uploadToS3(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`S3 respondió con status ${xhr.status}`));
    });
    xhr.addEventListener('error', () => reject(new Error('Error de red al subir el archivo')));
    xhr.addEventListener('timeout', () => reject(new Error('Tiempo de espera agotado')));

    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.setRequestHeader('x-amz-tagging', 'status=unconfirmed');
    xhr.timeout = 120_000;
    xhr.send(file);
  });
}

export function useFileUpload() {
  // { id, file, fileName, fileSize, mimeType, status, progress, error, s3Key }
  const [files, setFiles] = useState([]);
  const filesRef = useRef([]);
  filesRef.current = files;
  const [isRegistering, setIsRegistering] = useState(false);
  const nextId = useRef(0);

  const addFiles = useCallback((newFiles) => {
    const fileArray = Array.from(newFiles);
    const accepted = [];
    const rejected = [];

    setFiles((prev) => {
      const remaining = MAX_FILES - prev.length;

      if (remaining <= 0) {
        fileArray.forEach((f) => rejected.push({ name: f.name, error: `Máximo ${MAX_FILES} archivos permitidos` }));
        return prev;
      }

      const toAdd = fileArray.slice(0, remaining);
      const overflow = fileArray.slice(remaining);
      overflow.forEach((f) => rejected.push({ name: f.name, error: `Máximo ${MAX_FILES} archivos permitidos` }));

      const entries = [];
      for (const file of toAdd) {
        const validationError = validateFile(file);
        if (validationError) {
          rejected.push({ name: file.name, error: validationError });
        } else {
          const id = nextId.current++;
          entries.push({
            id,
            file,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            status: 'pending',
            progress: 0,
            error: null,
            s3Key: null,
          });
          accepted.push(file.name);
        }
      }

      return [...prev, ...entries];
    });

    return { accepted, rejected };
  }, []);

  const removeFile = useCallback((fileId) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  /**
   * Mark a set of file ids with a partial update.
   */
  const patchFiles = useCallback((ids, patch) => {
    const idSet = new Set(ids);
    setFiles((prev) => prev.map((f) => (idSet.has(f.id) ? { ...f, ...(typeof patch === 'function' ? patch(f) : patch) } : f)));
  }, []);

  const patchFile = useCallback((id, patch) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...(typeof patch === 'function' ? patch(f) : patch) } : f)));
  }, []);

  /**
   * Upload all pending (or previously-failed) files to S3 for a given session,
   * then register them with the backend.
   *
   * Returns { ok: boolean, registered: Attachment[] | null, error?: string }.
   *
   * This is called ONCE after Wompi approves the payment and the session row
   * exists. It never runs before payment — `addFiles` only caches the File refs.
   */
  const uploadToSession = useCallback(
    async (sessionId) => {
      if (!sessionId) return { ok: false, registered: null, error: 'sessionId requerido' };

      const pending = filesRef.current.filter((f) => f.status === 'pending' || f.status === 'error');
      if (pending.length === 0) return { ok: true, registered: [] };

      const pendingIds = pending.map((p) => p.id);
      patchFiles(pendingIds, { status: 'uploading', progress: 0, error: null });

      // 1. Request presigned URLs scoped to this session
      const fileMeta = pending.map((f) => ({
        fileName: f.fileName,
        mimeType: f.mimeType,
        fileSize: f.fileSize,
      }));

      const { ok, data } = await authFetch(
        `/api/sessions/${encodeURIComponent(sessionId)}/attachments/upload-urls`,
        { method: 'POST', body: JSON.stringify({ files: fileMeta }) },
      );

      if (!ok || !data?.success) {
        const errorMsg = data?.error || 'No se pudieron obtener URLs de subida';
        patchFiles(pendingIds, { status: 'error', error: errorMsg });
        return { ok: false, registered: null, error: errorMsg };
      }

      const urlByIdx = data.urls;

      // 2. Upload each file independently (one failure doesn't block others)
      const uploadResults = await Promise.allSettled(
        pending.map(async (entry, idx) => {
          const urlInfo = urlByIdx[idx];
          if (!urlInfo) throw new Error('URL de subida faltante');

          await uploadToS3(urlInfo.uploadUrl, entry.file, (progress) => {
            patchFile(entry.id, { progress });
          });

          patchFile(entry.id, { status: 'success', progress: 100, s3Key: urlInfo.s3Key });
          return {
            s3Key: urlInfo.s3Key,
            fileName: entry.fileName,
            fileSize: entry.fileSize,
            mimeType: entry.mimeType,
          };
        }),
      );

      // Mark any failed uploads
      uploadResults.forEach((r, idx) => {
        if (r.status === 'rejected') {
          patchFile(pending[idx].id, { status: 'error', error: r.reason?.message || 'Error al subir' });
        }
      });

      const successful = uploadResults
        .filter((r) => r.status === 'fulfilled')
        .map((r) => r.value);

      if (successful.length === 0) {
        return { ok: false, registered: null, error: 'Ningún archivo pudo subirse a S3' };
      }

      // 3. Register the successfully-uploaded files with the session
      setIsRegistering(true);
      const registerRes = await authFetch(
        `/api/sessions/${encodeURIComponent(sessionId)}/attachments/register`,
        { method: 'POST', body: JSON.stringify({ attachments: successful }) },
      );
      setIsRegistering(false);

      if (!registerRes.ok || !registerRes.data?.success) {
        const errorMsg = registerRes.data?.error || 'Error al registrar archivos';
        // Keep S3 objects — lifecycle (unconfirmed tag) will eventually clean them.
        return { ok: false, registered: null, error: errorMsg };
      }

      return { ok: true, registered: registerRes.data.attachments };
    },
    [patchFile, patchFiles],
  );

  /**
   * Retry upload for a SINGLE failed file. The file is reset to 'pending'
   * and only that one is uploaded; other errored files are not touched.
   */
  const retryFile = useCallback(
    async (sessionId, fileId) => {
      const target = filesRef.current.find((f) => f.id === fileId);
      if (!target) return { ok: false, error: 'Archivo no encontrado' };

      patchFile(fileId, { status: 'uploading', progress: 0, error: null });

      const { ok, data } = await authFetch(
        `/api/sessions/${encodeURIComponent(sessionId)}/attachments/upload-urls`,
        {
          method: 'POST',
          body: JSON.stringify({
            files: [{ fileName: target.fileName, mimeType: target.mimeType, fileSize: target.fileSize }],
          }),
        },
      );

      if (!ok || !data?.success || !data.urls?.[0]) {
        const errorMsg = data?.error || 'No se pudo obtener URL de subida';
        patchFile(fileId, { status: 'error', error: errorMsg });
        return { ok: false, error: errorMsg };
      }

      const urlInfo = data.urls[0];
      try {
        await uploadToS3(urlInfo.uploadUrl, target.file, (progress) => {
          patchFile(fileId, { progress });
        });
      } catch (err) {
        patchFile(fileId, { status: 'error', error: err.message });
        return { ok: false, error: err.message };
      }

      patchFile(fileId, { status: 'success', progress: 100, s3Key: urlInfo.s3Key });

      setIsRegistering(true);
      const registerRes = await authFetch(
        `/api/sessions/${encodeURIComponent(sessionId)}/attachments/register`,
        {
          method: 'POST',
          body: JSON.stringify({
            attachments: [{
              s3Key: urlInfo.s3Key,
              fileName: target.fileName,
              fileSize: target.fileSize,
              mimeType: target.mimeType,
            }],
          }),
        },
      );
      setIsRegistering(false);

      if (!registerRes.ok || !registerRes.data?.success) {
        return { ok: false, error: registerRes.data?.error || 'Error al registrar archivo' };
      }
      return { ok: true, registered: registerRes.data.attachments };
    },
    [patchFile],
  );

  const isUploading = files.some((f) => f.status === 'uploading');

  const uploadedFiles = files
    .filter((f) => f.status === 'success' && f.s3Key)
    .map((f) => ({
      s3Key: f.s3Key,
      fileName: f.fileName,
      fileSize: f.fileSize,
      mimeType: f.mimeType,
    }));

  const hasPendingUploads = files.some((f) => f.status === 'pending' || f.status === 'error');

  return {
    files,
    addFiles,
    removeFile,
    retryFile,
    uploadToSession,
    isUploading,
    isRegistering,
    uploadedFiles,
    hasPendingUploads,
  };
}
