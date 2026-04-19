'use client';

/**
 * useFileUpload — Manages file uploads to S3 via presigned URLs.
 *
 * Flow:
 *   1. Validate files client-side (type, size).
 *   2. Request presigned PUT URLs from POST /api/attachments/presigned-urls.
 *   3. Upload each file to S3 via XMLHttpRequest (for real upload progress).
 *   4. Track per-file status: pending → uploading → success | error.
 *   5. On error, allow retry for individual files without blocking others.
 *
 * Returns:
 *   { uploadFiles, removeFile, retryFile, files, isUploading, uploadedFiles }
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

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;

/** @typedef {'pending' | 'uploading' | 'success' | 'error'} FileStatus */

/**
 * Validate a single file client-side. Returns error message or null.
 */
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
 * Upload a single file to S3 via XMLHttpRequest (supports progress tracking).
 * Returns a Promise that resolves on success and rejects on error.
 */
function uploadToS3(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 respondió con status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Error de red al subir el archivo'));
    });

    xhr.addEventListener('timeout', () => {
      reject(new Error('Tiempo de espera agotado al subir el archivo'));
    });

    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.setRequestHeader('x-amz-tagging', 'status=unconfirmed');
    xhr.timeout = 120_000; // 2 min per file
    xhr.send(file);
  });
}

export function useFileUpload() {
  // Each entry: { id, file, fileName, fileSize, mimeType, status, progress, error, s3Key, uploadUrl }
  const [files, setFiles] = useState([]);
  const nextId = useRef(0);

  /**
   * Add files to the queue with client-side validation.
   * Invalid files are rejected immediately with an error message.
   * Returns { accepted: string[], rejected: { name, error }[] }.
   */
  const addFiles = useCallback((newFiles) => {
    const fileArray = Array.from(newFiles);
    const accepted = [];
    const rejected = [];

    setFiles((prev) => {
      const remaining = MAX_FILES - prev.length;

      if (remaining <= 0) {
        fileArray.forEach((f) =>
          rejected.push({ name: f.name, error: `Máximo ${MAX_FILES} archivos permitidos` }),
        );
        return prev;
      }

      const toAdd = fileArray.slice(0, remaining);
      const overflow = fileArray.slice(remaining);

      overflow.forEach((f) =>
        rejected.push({ name: f.name, error: `Máximo ${MAX_FILES} archivos permitidos` }),
      );

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
            uploadUrl: null,
          });
          accepted.push(file.name);
        }
      }

      return [...prev, ...entries];
    });

    return { accepted, rejected };
  }, []);

  /**
   * Remove a file from the queue (before or after upload).
   */
  const removeFile = useCallback((fileId) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  /**
   * Upload all pending files to S3.
   * 1. Request presigned URLs for all pending files.
   * 2. Upload each file independently — one failure doesn't block others.
   */
  const uploadFiles = useCallback(async () => {
    let currentFiles;
    setFiles((prev) => {
      currentFiles = prev;
      return prev;
    });

    const pending = currentFiles.filter((f) => f.status === 'pending' || f.status === 'error');
    if (pending.length === 0) return [];

    // Mark all pending as uploading
    setFiles((prev) =>
      prev.map((f) =>
        pending.some((p) => p.id === f.id)
          ? { ...f, status: 'uploading', progress: 0, error: null }
          : f,
      ),
    );

    // 1. Request presigned URLs from backend
    const fileMeta = pending.map((f) => ({
      fileName: f.fileName,
      mimeType: f.mimeType,
      fileSize: f.fileSize,
    }));

    const { ok, data } = await authFetch('/api/attachments/presigned-urls', {
      method: 'POST',
      body: JSON.stringify({ files: fileMeta }),
    });

    if (!ok || !data?.success) {
      const errorMsg = data?.error || 'Error al obtener URLs de subida';
      setFiles((prev) =>
        prev.map((f) =>
          pending.some((p) => p.id === f.id) ? { ...f, status: 'error', error: errorMsg } : f,
        ),
      );
      return [];
    }

    // Map presigned URLs to pending files
    const urlMap = {};
    data.urls.forEach((u, i) => {
      if (pending[i]) {
        urlMap[pending[i].id] = u;
      }
    });

    // Assign s3Keys and uploadUrls
    setFiles((prev) =>
      prev.map((f) => {
        const urlInfo = urlMap[f.id];
        return urlInfo ? { ...f, s3Key: urlInfo.s3Key, uploadUrl: urlInfo.uploadUrl } : f;
      }),
    );

    // 2. Upload each file independently
    const uploadPromises = pending.map(async (fileEntry) => {
      const urlInfo = urlMap[fileEntry.id];
      if (!urlInfo) return;

      try {
        await uploadToS3(urlInfo.uploadUrl, fileEntry.file, (progress) => {
          setFiles((prev) =>
            prev.map((f) => (f.id === fileEntry.id ? { ...f, progress } : f)),
          );
        });

        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileEntry.id
              ? { ...f, status: 'success', progress: 100, s3Key: urlInfo.s3Key }
              : f,
          ),
        );
      } catch (err) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileEntry.id
              ? { ...f, status: 'error', error: err.message }
              : f,
          ),
        );
      }
    });

    await Promise.allSettled(uploadPromises);

    // Return the final file state
    let finalFiles;
    setFiles((prev) => {
      finalFiles = prev;
      return prev;
    });
    return finalFiles;
  }, []);

  /**
   * Retry uploading a single failed file.
   */
  const retryFile = useCallback(
    async (fileId) => {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, status: 'pending', progress: 0, error: null } : f,
        ),
      );
      // Re-trigger upload for all pending (will pick up the reset file)
      await uploadFiles();
    },
    [uploadFiles],
  );

  const isUploading = files.some((f) => f.status === 'uploading');

  // Files that uploaded successfully — these are the attachment metadata for the payment
  const uploadedFiles = files
    .filter((f) => f.status === 'success' && f.s3Key)
    .map((f) => ({
      s3Key: f.s3Key,
      fileName: f.fileName,
      fileSize: f.fileSize,
      mimeType: f.mimeType,
    }));

  return {
    files,
    addFiles,
    removeFile,
    uploadFiles,
    retryFile,
    isUploading,
    uploadedFiles,
  };
}
