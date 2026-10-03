/**
 * Event cover images. Same flow as the news images (news.service.js):
 *   1. Admin requests a presigned PUT URL → object uploaded to S3 tagged
 *      `status=unconfirmed` so lifecycle rules cull abandoned uploads.
 *   2. Client PUTs the image directly to S3.
 *   3. On create/update the event carries the s3Key; resolveEventImageKey
 *      verifies it exists and is a sane image, flips the tag to `confirmed`
 *      and returns the public URL to persist.
 *
 * Key layout: event-images/{uuid}.{ext}. The duplication with news is
 * deliberate: each domain keeps its own prefix rules.
 */

import { randomUUID } from 'crypto';
import { generateUploadUrl, headObject, getPublicUrl, setObjectTags } from '../s3';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB — keep in sync with the route schema.

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const PREFIX = 'event-images/';

function domainError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Presigned PUT URL for an event cover upload.
 * @param {{ mimeType: string, fileSize: number }} file
 * @returns {Promise<{ uploadUrl: string, s3Key: string }>}
 */
export async function generateEventImageUploadUrl(file) {
  if (!file || typeof file !== 'object') {
    throw domainError('Metadata del archivo es requerida', 'VALIDATION_ERROR');
  }
  if (!ALLOWED_MIME_TYPES.has(file.mimeType)) {
    throw domainError(`Tipo de imagen no permitido: ${file.mimeType}`, 'VALIDATION_ERROR');
  }
  if (
    typeof file.fileSize !== 'number'
    || !Number.isFinite(file.fileSize)
    || file.fileSize <= 0
  ) {
    throw domainError('Tamaño de archivo inválido', 'VALIDATION_ERROR');
  }
  if (file.fileSize > MAX_FILE_SIZE) {
    throw domainError(
      `La imagen excede el límite de ${MAX_FILE_SIZE / 1024 / 1024} MB`,
      'VALIDATION_ERROR',
    );
  }

  const s3Key = `${PREFIX}${randomUUID()}.${MIME_TO_EXT[file.mimeType]}`;
  const uploadUrl = await generateUploadUrl(s3Key, file.mimeType, {
    contentLength: file.fileSize,
    tagging: 'status=unconfirmed',
  });
  return { uploadUrl, s3Key };
}

/**
 * Validate an uploaded event image key and return its public URL.
 * Rejects keys outside our prefix (an admin could otherwise claim any bucket
 * object) and verifies the object actually exists and is a sane image.
 */
export async function resolveEventImageKey(s3Key) {
  if (typeof s3Key !== 'string' || !s3Key.startsWith(PREFIX) || s3Key.includes('..')) {
    throw domainError('La clave de imagen no es válida', 'VALIDATION_ERROR');
  }

  let head;
  try {
    head = await headObject(s3Key);
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      throw domainError('La imagen no se encontró en S3 (¿se subió?)', 'NOT_FOUND');
    }
    throw err;
  }

  if (head.contentType && !ALLOWED_MIME_TYPES.has(head.contentType)) {
    throw domainError(`Tipo de imagen no permitido: ${head.contentType}`, 'VALIDATION_ERROR');
  }
  if (typeof head.contentLength === 'number' && head.contentLength > MAX_FILE_SIZE) {
    throw domainError('La imagen excede el límite de tamaño', 'VALIDATION_ERROR');
  }

  // Fire-and-forget: mark confirmed so lifecycle rules leave it alone.
  setObjectTags(s3Key, { status: 'confirmed' }).catch((err) => {
    console.warn(`[event-image] failed to confirm tag for ${s3Key}:`, err.message);
  });

  return getPublicUrl(s3Key);
}
