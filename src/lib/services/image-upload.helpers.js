/**
 * Prefix-scoped S3 image helpers for admin uploads (news images, event
 * covers). Flow:
 *   1. generateUploadUrl → presigned PUT; the object is tagged
 *      `status=unconfirmed` so lifecycle rules cull abandoned uploads.
 *   2. The client PUTs the image directly to S3.
 *   3. resolveKey → checks the key is under the prefix, headObject verifies
 *      it exists and is a sane image, the tag flips to `confirmed`, and the
 *      public URL comes back to be persisted.
 *
 * Each domain keeps its own prefix ({prefix}{uuid}.{ext}) so a key from one
 * domain can never claim another domain's object.
 */

import { randomUUID } from 'crypto';
import * as s3 from '../s3';

export const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024; // 5 MB — keep in sync with the route schemas.

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function domainError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * @param {string} prefix  S3 key prefix, e.g. 'news-images/'
 * @param {{ logTag: string }} options  tag for warning logs, e.g. 'news'
 * @returns {{ generateUploadUrl: Function, resolveKey: Function }}
 *          Errors carry `code` VALIDATION_ERROR or NOT_FOUND.
 */
export function createImageKeyHelpers(prefix, { logTag }) {
  /**
   * Presigned PUT URL for an image upload.
   * @param {{ mimeType: string, fileSize: number }} file
   * @returns {Promise<{ uploadUrl: string, s3Key: string }>}
   */
  async function generateUploadUrl(file) {
    if (!file || typeof file !== 'object') {
      throw domainError('Metadata del archivo es requerida', 'VALIDATION_ERROR');
    }
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimeType)) {
      throw domainError(`Tipo de imagen no permitido: ${file.mimeType}`, 'VALIDATION_ERROR');
    }
    if (
      typeof file.fileSize !== 'number'
      || !Number.isFinite(file.fileSize)
      || file.fileSize <= 0
    ) {
      throw domainError('Tamaño de archivo inválido', 'VALIDATION_ERROR');
    }
    if (file.fileSize > MAX_IMAGE_FILE_SIZE) {
      throw domainError(
        `La imagen excede el límite de ${MAX_IMAGE_FILE_SIZE / 1024 / 1024} MB`,
        'VALIDATION_ERROR',
      );
    }

    const s3Key = `${prefix}${randomUUID()}.${MIME_TO_EXT[file.mimeType]}`;
    const uploadUrl = await s3.generateUploadUrl(s3Key, file.mimeType, {
      contentLength: file.fileSize,
      tagging: 'status=unconfirmed',
    });
    return { uploadUrl, s3Key };
  }

  /**
   * Validate an uploaded key and return its public URL. Rejects keys outside
   * the prefix (an admin could otherwise claim any bucket object) and
   * verifies the object actually exists and is a sane image.
   */
  async function resolveKey(s3Key) {
    if (typeof s3Key !== 'string' || !s3Key.startsWith(prefix) || s3Key.includes('..')) {
      throw domainError('La clave de imagen no es válida', 'VALIDATION_ERROR');
    }

    let head;
    try {
      head = await s3.headObject(s3Key);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        throw domainError('La imagen no se encontró en S3 (¿se subió?)', 'NOT_FOUND');
      }
      throw err;
    }

    if (head.contentType && !ALLOWED_IMAGE_MIME_TYPES.has(head.contentType)) {
      throw domainError(`Tipo de imagen no permitido: ${head.contentType}`, 'VALIDATION_ERROR');
    }
    if (typeof head.contentLength === 'number' && head.contentLength > MAX_IMAGE_FILE_SIZE) {
      throw domainError('La imagen excede el límite de tamaño', 'VALIDATION_ERROR');
    }

    // Fire-and-forget: mark confirmed so lifecycle rules leave it alone.
    s3.setObjectTags(s3Key, { status: 'confirmed' }).catch((err) => {
      console.warn(`[${logTag}] failed to confirm tag for ${s3Key}:`, err.message);
    });

    return s3.getPublicUrl(s3Key);
  }

  return { generateUploadUrl, resolveKey };
}
