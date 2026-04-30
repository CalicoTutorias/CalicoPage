/**
 * Session Attachment Service
 * Business logic for file attachments on tutoring sessions.
 *
 * - Generates presigned PUT URLs (with S3 tagging for orphan cleanup).
 * - Confirms attachments after payment (updates S3 tags).
 * - Generates authorized presigned GET URLs (access control).
 * - Cleans up orphaned files from S3.
 */

import { randomUUID } from 'crypto';
import { PutObjectTaggingCommand } from '@aws-sdk/client-s3';
import { generateUploadUrl, generateDownloadUrl, deleteObject, buildS3Client } from '../s3';
import * as attachmentRepo from '../repositories/session-attachment.repository';
import * as sessionRepo from '../repositories/session.repository';

const s3Client = buildS3Client();

const BUCKET = process.env.AWS_S3_BUCKET || 'calico-uploads';

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
const DOWNLOAD_URL_EXPIRY = 900; // 15 minutes

/**
 * Sanitize a filename for use as an S3 key segment.
 * Removes special chars from BOTH base and extension to prevent path traversal.
 * Limits total length, preserves a clean extension.
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

// ===== UPLOAD FLOW =====

/**
 * Generate presigned PUT URLs for a batch of files.
 * Each file is uploaded with tag `status=unconfirmed` so S3 lifecycle rules
 * can clean up orphaned files if the payment is never completed.
 *
 * @param {{ fileName: string, mimeType: string, fileSize: number }[]} files
 * @returns {{ batchId: string, urls: { s3Key: string, uploadUrl: string, fileName: string }[] }}
 */
export async function generateUploadUrls(files) {
  if (!files?.length) {
    const err = new Error('Debes enviar al menos un archivo');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (files.length > MAX_FILES) {
    const err = new Error(`Máximo ${MAX_FILES} archivos permitidos`);
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  for (const file of files) {
    if (!ALLOWED_MIME_TYPES.has(file.mimeType)) {
      const err = new Error(`Tipo de archivo no permitido: ${file.mimeType}`);
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    if (file.fileSize > MAX_FILE_SIZE) {
      const err = new Error(`El archivo "${file.fileName}" excede el límite de 10 MB`);
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
  }

  const batchId = randomUUID();
  const timestamp = Date.now();

  const urls = await Promise.all(
    files.map(async (file) => {
      const safeName = sanitizeFileName(file.fileName);
      const s3Key = `session-attachments/${batchId}/${timestamp}-${safeName}`;

      // Generate presigned PUT URL with:
      //   - ContentLength: binds declared fileSize so client can't upload larger files
      //   - Tagging: marks as unconfirmed for S3 lifecycle orphan cleanup
      const uploadUrl = await generateUploadUrl(s3Key, file.mimeType, {
        contentLength: file.fileSize,
        tagging: 'status=unconfirmed',
      });

      return {
        s3Key,
        uploadUrl,
        fileName: file.fileName,
      };
    }),
  );

  return { batchId, urls };
}

// ===== REGISTRATION (after payment) =====

/**
 * Register attachment records in the DB and confirm them in S3 (update tag to confirmed).
 * Called after successful payment creates the session.
 *
 * @param {string} sessionId
 * @param {{ s3Key: string, fileName: string, fileSize: number, mimeType: string }[]} attachmentsMeta
 */
export async function registerAttachments(sessionId, attachmentsMeta) {
  if (!attachmentsMeta?.length) return [];

  // Create DB records
  const records = await attachmentRepo.createMany(sessionId, attachmentsMeta);

  // Fire-and-forget: update S3 tags from unconfirmed → confirmed
  for (const att of attachmentsMeta) {
    confirmS3Object(att.s3Key).catch((err) => {
      console.warn(`Failed to confirm S3 tag for ${att.s3Key}:`, err.message);
    });
  }

  return records;
}

/**
 * Update S3 object tag to `status=confirmed`.
 */
async function confirmS3Object(s3Key) {
  const command = new PutObjectTaggingCommand({
    Bucket: BUCKET,
    Key: s3Key,
    Tagging: {
      TagSet: [{ Key: 'status', Value: 'confirmed' }],
    },
  });
  await s3Client.send(command);
}

// ===== AUTHORIZED DOWNLOADS =====

/**
 * Get presigned download URLs for a session's attachments, if the requester is authorized.
 *
 * Access rules:
 *   1. Student who created the session → always allowed.
 *   2. Assigned tutor + session is Pending → allowed (evaluating).
 *   3. Assigned tutor + session is Accepted → allowed (preparing class).
 *   4. Any other case → denied.
 *
 * @param {string} sessionId
 * @param {number} requesterId - User ID of the person requesting access
 * @returns {{ authorized: boolean, attachments?: object[], reason?: string }}
 */
export async function getAuthorizedDownloadUrls(sessionId, requesterId) {
  const session = await sessionRepo.findById(sessionId);
  if (!session) {
    const err = new Error('Sesión no encontrada');
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Check authorization
  const isStudent = session.participants?.some((p) => p.studentId === requesterId);
  const isTutor = session.tutorId === requesterId;

  let authorized = false;

  if (isStudent) {
    // Student creator always has access
    authorized = true;
  } else if (isTutor && (session.status === 'Pending' || session.status === 'Accepted')) {
    // Tutor can access when evaluating or preparing
    authorized = true;
  }

  if (!authorized) {
    return {
      authorized: false,
      reason: getAccessDeniedReason(session, isTutor),
    };
  }

  // Fetch attachments and generate download URLs
  const attachments = await attachmentRepo.findBySessionId(sessionId);

  if (!attachments.length) {
    return { authorized: true, attachments: [] };
  }

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
 * Delete orphaned files from S3 (e.g., when payment fails or session is canceled).
 * @param {string[]} s3Keys
 */
export async function cleanupOrphanedFiles(s3Keys) {
  if (!s3Keys?.length) return;

  const results = await Promise.allSettled(
    s3Keys.map((key) => deleteObject(key)),
  );

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    console.warn(`Failed to delete ${failed.length}/${s3Keys.length} S3 objects`);
  }
}

/**
 * Delete all attachments (DB records + S3 files) for a session.
 * @param {string} sessionId
 */
export async function deleteSessionAttachments(sessionId) {
  const attachments = await attachmentRepo.findBySessionId(sessionId);
  const s3Keys = attachments.map((a) => a.s3Key);

  // Delete DB records first
  await attachmentRepo.deleteBySessionId(sessionId);

  // Then clean S3 (fire-and-forget)
  if (s3Keys.length > 0) {
    cleanupOrphanedFiles(s3Keys).catch((err) => {
      console.warn(`Failed to cleanup S3 files for session ${sessionId}:`, err.message);
    });
  }
}
