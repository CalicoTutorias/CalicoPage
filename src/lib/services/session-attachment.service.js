/**
 * Session Attachment Service
 * Business logic for file attachments tied to an existing tutoring session.
 *
 * Upload flow (post-payment):
 *   1. Client calls POST /api/sessions/:id/attachments/upload-urls
 *      → generateSessionUploadUrls() verifies the requester is the session's
 *        student creator, issues session-scoped presigned PUT URLs.
 *   2. Client uploads each file to S3 directly with the returned URL.
 *   3. Client calls POST /api/sessions/:id/attachments/register
 *      → registerSessionAttachments() verifies the requester, validates that
 *        each s3Key belongs to this session's path, HEADs the object in S3
 *        to confirm it was uploaded, creates DB rows and retags objects.
 *
 * Download flow (unchanged): getAuthorizedDownloadUrls().
 */

import { randomUUID } from 'crypto';
import {
  generateUploadUrl,
  generateDownloadUrl,
  deleteObject,
  headObject,
  setObjectTags,
} from '../s3';
import * as attachmentRepo from '../repositories/session-attachment.repository';
import * as sessionRepo from '../repositories/session.repository';

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
const UPLOAD_URL_EXPIRY = 300; // 5 minutes
const DOWNLOAD_URL_EXPIRY = 900; // 15 minutes

function validationError(message) {
  const err = new Error(message);
  err.code = 'VALIDATION_ERROR';
  return err;
}

function forbiddenError(message) {
  const err = new Error(message);
  err.code = 'FORBIDDEN';
  return err;
}

function notFoundError(message) {
  const err = new Error(message);
  err.code = 'NOT_FOUND';
  return err;
}

/**
 * Sanitize a filename for use as an S3 key segment.
 * Strips special chars from base and extension to prevent traversal.
 */
function sanitizeFileName(name) {
  const rawExt = name.includes('.') ? name.split('.').pop() : '';
  const ext = rawExt ? '.' + rawExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 10) : '';
  const base = name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);
  return `${base}${ext}`;
}

function sessionKeyPrefix(sessionId) {
  return `session-attachments/${sessionId}/`;
}

function buildSessionKey(sessionId, fileName) {
  return `${sessionKeyPrefix(sessionId)}${randomUUID()}-${sanitizeFileName(fileName)}`;
}

/**
 * Fetch the session and assert the requester is its student creator.
 * Tutor access to uploads is not allowed — only the student who booked uploads material.
 */
async function requireSessionAndStudent(sessionId, requesterId) {
  const session = await sessionRepo.findById(sessionId);
  if (!session) throw notFoundError('Sesión no encontrada');

  const isStudent = session.participants?.some((p) => p.studentId === requesterId);
  if (!isStudent) {
    throw forbiddenError('Solo el estudiante que reservó puede gestionar archivos');
  }
  return session;
}

function validateFilesInput(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw validationError('Debes enviar al menos un archivo');
  }
  if (files.length > MAX_FILES) {
    throw validationError(`Máximo ${MAX_FILES} archivos permitidos`);
  }

  for (const file of files) {
    if (!file?.fileName || typeof file.fileName !== 'string') {
      throw validationError('fileName requerido');
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimeType)) {
      throw validationError(`Tipo de archivo no permitido: ${file.mimeType}`);
    }
    if (
      typeof file.fileSize !== 'number' ||
      !Number.isInteger(file.fileSize) ||
      file.fileSize <= 0
    ) {
      throw validationError(`Tamaño inválido para "${file.fileName}"`);
    }
    if (file.fileSize > MAX_FILE_SIZE) {
      throw validationError(`"${file.fileName}" excede el límite de ${MAX_FILE_SIZE / 1024 / 1024} MB`);
    }
  }
}

// ===== UPLOAD FLOW =====

/**
 * Issue session-scoped presigned PUT URLs.
 * The s3Key is always under `session-attachments/{sessionId}/` so the register
 * step can verify ownership by prefix match.
 */
export async function generateSessionUploadUrls(sessionId, requesterId, files) {
  validateFilesInput(files);
  await requireSessionAndStudent(sessionId, requesterId);

  const urls = await Promise.all(
    files.map(async (file) => {
      const s3Key = buildSessionKey(sessionId, file.fileName);
      const uploadUrl = await generateUploadUrl(s3Key, file.mimeType, {
        expiresIn: UPLOAD_URL_EXPIRY,
        contentLength: file.fileSize,
        tagging: 'status=unconfirmed',
      });
      return { s3Key, uploadUrl, fileName: file.fileName };
    }),
  );

  return { urls };
}

/**
 * Register uploaded attachments after the client has PUT them to S3.
 *
 * Safety checks:
 *   1. Requester is the session's student creator.
 *   2. Each s3Key must live under this session's prefix (prevents cross-session
 *      attachment injection).
 *   3. Each object must exist in S3 (HeadObject) with the declared size and MIME.
 *   4. After DB rows are created, tags are flipped to status=confirmed so
 *      S3 lifecycle rules don't sweep them.
 *
 * Errors propagate — the caller decides how to respond.
 */
export async function registerSessionAttachments(sessionId, requesterId, attachments) {
  validateFilesInput(attachments);
  await requireSessionAndStudent(sessionId, requesterId);

  const prefix = sessionKeyPrefix(sessionId);
  for (const att of attachments) {
    if (typeof att.s3Key !== 'string' || !att.s3Key.startsWith(prefix)) {
      throw forbiddenError('s3Key no pertenece a esta sesión');
    }
  }

  // Verify each object actually exists in S3 before touching the DB
  const verified = await Promise.all(
    attachments.map(async (att) => {
      const meta = await headObject(att.s3Key); // throws NOT_FOUND if missing
      if (meta.contentLength !== att.fileSize) {
        throw validationError(`El tamaño subido no coincide para "${att.fileName}"`);
      }
      if (meta.contentType && meta.contentType !== att.mimeType) {
        throw validationError(`El tipo subido no coincide para "${att.fileName}"`);
      }
      return att;
    }),
  );

  // Persist DB rows
  const records = await attachmentRepo.createMany(sessionId, verified);

  // Flip tags to confirmed (fire-and-forget: lifecycle won't touch them on next sweep)
  for (const att of verified) {
    setObjectTags(att.s3Key, { status: 'confirmed' }).catch((err) => {
      console.warn(`[attachments] Failed to confirm tag for ${att.s3Key}:`, err.message);
    });
  }

  return records;
}

// ===== AUTHORIZED DOWNLOADS =====

/**
 * Get presigned download URLs for a session's attachments if the requester is authorized.
 *
 * Access rules:
 *   1. Student creator → always allowed.
 *   2. Assigned tutor + Pending/Accepted → allowed.
 *   3. Otherwise → denied.
 */
export async function getAuthorizedDownloadUrls(sessionId, requesterId) {
  const session = await sessionRepo.findById(sessionId);
  if (!session) throw notFoundError('Sesión no encontrada');

  const isStudent = session.participants?.some((p) => p.studentId === requesterId);
  const isTutor = session.tutorId === requesterId;

  let authorized = false;
  if (isStudent) authorized = true;
  else if (isTutor && (session.status === 'Pending' || session.status === 'Accepted')) authorized = true;

  if (!authorized) {
    return { authorized: false, reason: getAccessDeniedReason(session, isTutor) };
  }

  const attachments = await attachmentRepo.findBySessionId(sessionId);
  if (!attachments.length) return { authorized: true, attachments: [] };

  const withUrls = await Promise.all(
    attachments.map(async (att) => ({
      id: att.id,
      fileName: att.fileName,
      fileSize: att.fileSize,
      mimeType: att.mimeType,
      uploadedAt: att.uploadedAt,
      downloadUrl: await generateDownloadUrl(att.s3Key, DOWNLOAD_URL_EXPIRY),
    })),
  );

  return { authorized: true, attachments: withUrls };
}

function getAccessDeniedReason(session, isTutor) {
  if (session.status === 'Canceled') return 'La sesión fue cancelada';
  if (session.status === 'Rejected') return 'La sesión fue rechazada';
  if (isTutor && session.status === 'Completed') return 'La sesión ya fue completada';
  if (!isTutor) return 'No tienes permiso para ver estos archivos';
  return 'Esta solicitud ya fue tomada por otro tutor';
}

// ===== CLEANUP =====

/**
 * Delete orphaned files from S3. Used for best-effort cleanup on failed flows.
 */
export async function cleanupOrphanedFiles(s3Keys) {
  if (!s3Keys?.length) return;

  const results = await Promise.allSettled(s3Keys.map((key) => deleteObject(key)));
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    console.warn(`Failed to delete ${failed.length}/${s3Keys.length} S3 objects`);
  }
}

/**
 * Delete all attachments (DB records + S3 files) for a session.
 */
export async function deleteSessionAttachments(sessionId) {
  const attachments = await attachmentRepo.findBySessionId(sessionId);
  const s3Keys = attachments.map((a) => a.s3Key);

  await attachmentRepo.deleteBySessionId(sessionId);

  if (s3Keys.length > 0) {
    cleanupOrphanedFiles(s3Keys).catch((err) => {
      console.warn(`Failed to cleanup S3 files for session ${sessionId}:`, err.message);
    });
  }
}
