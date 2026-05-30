/**
 * Profile Picture Service
 * Business logic for user avatars.
 *
 * Flow (mirrors session-attachment.service.js):
 *   1. Client requests a presigned PUT URL → object uploaded with tag
 *      `status=unconfirmed` so S3 lifecycle rules cull orphans if the user
 *      abandons the flow.
 *   2. Client PUTs the (already compressed) image directly to S3.
 *   3. Client calls confirm: we headObject to verify it exists & size is sane,
 *      flip the tag to `confirmed`, persist the public URL on User, and
 *      fire-and-forget delete the previous picture from S3.
 *
 * Key layout: profile-pictures/{userId}/{uuid}.{ext}
 *   — userId-scoped prefix lets us validate ownership cheaply (string prefix
 *     check) without an extra DB lookup, and groups blast radius per user.
 */

import { randomUUID } from 'crypto';
import { PutObjectTaggingCommand } from '@aws-sdk/client-s3';
import {
  generateUploadUrl,
  deleteObject,
  headObject,
  getPublicUrl,
  buildS3Client,
} from '../s3';
import * as userRepository from '../repositories/user.repository';

const s3Client = buildS3Client();
const BUCKET = process.env.AWS_S3_BUCKET || 'calico-uploads';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Maximum size accepted at the presign step. Clients compress to webp ~150KB
// before uploading, so 5 MB is generous headroom that still blocks accidental
// RAW-from-phone uploads from costing storage / bandwidth.
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const PREFIX = 'profile-pictures';

function userPrefix(userId) {
  return `${PREFIX}/${userId}/`;
}

/**
 * Extract the S3 key from a stored `profilePictureUrl` (public URL form).
 * Returns null when the stored value isn't recognisable as one of our keys
 * (e.g. a legacy Google OAuth avatar URL we shouldn't try to delete).
 */
function keyFromStoredUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const marker = `/${PREFIX}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + 1); // drop the leading slash
}

// ===== UPLOAD FLOW =====

/**
 * Generate a presigned PUT URL for a single profile picture upload.
 *
 * @param {string} userId
 * @param {{ mimeType: string, fileSize: number }} file
 * @returns {Promise<{ uploadUrl: string, s3Key: string }>}
 */
export async function generateProfilePictureUploadUrl(userId, file) {
  if (!userId) {
    const err = new Error('Usuario no autenticado');
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  if (!file || typeof file !== 'object') {
    const err = new Error('Metadata del archivo es requerida');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (!ALLOWED_MIME_TYPES.has(file.mimeType)) {
    const err = new Error(`Tipo de imagen no permitido: ${file.mimeType}`);
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (
    typeof file.fileSize !== 'number'
    || !Number.isFinite(file.fileSize)
    || file.fileSize <= 0
  ) {
    const err = new Error('Tamaño de archivo inválido');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (file.fileSize > MAX_FILE_SIZE) {
    const err = new Error(
      `La imagen excede el límite de ${MAX_FILE_SIZE / 1024 / 1024} MB`,
    );
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const ext = MIME_TO_EXT[file.mimeType];
  const s3Key = `${userPrefix(userId)}${randomUUID()}.${ext}`;

  // ContentLength signed into the URL → client cannot upload a larger file
  // than declared. Tag as unconfirmed so lifecycle rules clean up if the
  // user never finishes the confirm step.
  const uploadUrl = await generateUploadUrl(s3Key, file.mimeType, {
    contentLength: file.fileSize,
    tagging: 'status=unconfirmed',
  });

  return { uploadUrl, s3Key };
}

// ===== CONFIRM =====

/**
 * Confirm an upload: verify the object exists in S3 under the user's prefix,
 * persist the public URL on the User row, flip the tag to `confirmed`, and
 * fire-and-forget delete the previous picture (if it was one of ours).
 *
 * @param {string} userId
 * @param {string} s3Key
 * @returns {Promise<{ profilePictureUrl: string }>}
 */
export async function confirmProfilePicture(userId, s3Key) {
  if (!userId) {
    const err = new Error('Usuario no autenticado');
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  if (!s3Key || typeof s3Key !== 'string') {
    const err = new Error('Clave S3 inválida');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // Prevent a logged-in user from claiming another user's key.
  if (!s3Key.startsWith(userPrefix(userId))) {
    const err = new Error('La clave no pertenece a este usuario');
    err.code = 'FORBIDDEN';
    throw err;
  }

  // Verify the object actually exists (and pull its content-type/size for
  // defence-in-depth — the presigned URL constrained these, but a server-side
  // check protects against future client regressions).
  let head;
  try {
    head = await headObject(s3Key);
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      const e = new Error('La imagen no se encontró en S3 (¿se subió?)');
      e.code = 'NOT_FOUND';
      throw e;
    }
    throw err;
  }

  if (head.contentType && !ALLOWED_MIME_TYPES.has(head.contentType)) {
    const err = new Error(`Tipo de imagen no permitido: ${head.contentType}`);
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (typeof head.contentLength === 'number' && head.contentLength > MAX_FILE_SIZE) {
    const err = new Error('La imagen excede el límite de tamaño');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // Find the previous picture so we can delete it after the swap.
  const previous = await userRepository.findById(userId);
  const previousKey = keyFromStoredUrl(previous?.profilePictureUrl);

  // Persist the public URL on the user row.
  const profilePictureUrl = getPublicUrl(s3Key);
  await userRepository.update(userId, { profilePictureUrl });

  // Fire-and-forget S3 housekeeping. Don't block the response on these:
  //   - Flipping the tag to confirmed (so lifecycle rules leave it alone)
  //   - Deleting the previous picture (only if it lived under our prefix —
  //     never touch a Google OAuth avatar URL etc.)
  confirmS3Object(s3Key).catch((err) => {
    console.warn(`[profile-picture] failed to confirm tag for ${s3Key}:`, err.message);
  });

  if (previousKey && previousKey !== s3Key) {
    deleteObject(previousKey).catch((err) => {
      console.warn(`[profile-picture] failed to delete previous ${previousKey}:`, err.message);
    });
  }

  return { profilePictureUrl };
}

async function confirmS3Object(s3Key) {
  const command = new PutObjectTaggingCommand({
    Bucket: BUCKET,
    Key: s3Key,
    Tagging: { TagSet: [{ Key: 'status', Value: 'confirmed' }] },
  });
  await s3Client.send(command);
}

// ===== DELETE =====

/**
 * Remove the user's profile picture: clear the field and delete from S3
 * (fire-and-forget — DB is the source of truth, S3 failure is best-effort).
 */
export async function deleteProfilePicture(userId) {
  if (!userId) {
    const err = new Error('Usuario no autenticado');
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const user = await userRepository.findById(userId);
  const key = keyFromStoredUrl(user?.profilePictureUrl);

  await userRepository.update(userId, { profilePictureUrl: null });

  if (key) {
    deleteObject(key).catch((err) => {
      console.warn(`[profile-picture] failed to delete ${key}:`, err.message);
    });
  }

  return { profilePictureUrl: null };
}

// Exported for tests
export const __testing = { ALLOWED_MIME_TYPES, MAX_FILE_SIZE, keyFromStoredUrl };
