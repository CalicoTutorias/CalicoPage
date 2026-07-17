/**
 * News Service
 * Business logic for admin-authored news/announcements shown on the landing
 * page and the student/tutor homes.
 *
 * Image flow (mirrors profile-picture.service.js):
 *   1. Admin requests a presigned PUT URL → object uploaded to S3 tagged
 *      `status=unconfirmed` so lifecycle rules cull abandoned uploads.
 *   2. Client PUTs the image directly to S3.
 *   3. On create/update the post carries the s3Key; we headObject to verify
 *      it exists and is a sane image, flip the tag to `confirmed`, persist
 *      the public URL, and delete the previous image when replaced.
 *
 * Key layout: news-images/{uuid}.{ext} — namespaced prefix so a news key can
 * never collide with (or claim) another domain's object.
 */

import { randomUUID } from 'crypto';
import {
  generateUploadUrl,
  deleteObject,
  headObject,
  getPublicUrl,
  setObjectTags,
} from '../s3';
import * as newsRepository from '../repositories/news.repository';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB — keep in sync with the route schema.

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const PREFIX = 'news-images/';

function domainError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/** Extract our S3 key from a stored public URL; null if it isn't ours. */
function keyFromStoredUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const marker = `/${PREFIX}`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + 1);
}

// ===== PUBLIC FEED =====

export async function listPublished({ limit = 6, offset = 0 } = {}) {
  return newsRepository.findPublished({ limit, offset });
}

// ===== ADMIN =====

export async function listAll({ limit = 50, offset = 0 } = {}) {
  return newsRepository.findAllForAdmin({ limit, offset });
}

/**
 * Presigned PUT URL for a news image upload.
 * @param {{ mimeType: string, fileSize: number }} file
 */
export async function generateNewsImageUploadUrl(file) {
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
 * Validate an uploaded news image key and return its public URL.
 * Rejects keys outside our prefix (an admin could otherwise claim any bucket
 * object) and verifies the object actually exists and is a sane image.
 */
async function resolveImageKey(s3Key) {
  if (!s3Key.startsWith(PREFIX) || s3Key.includes('..')) {
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
    console.warn(`[news] failed to confirm tag for ${s3Key}:`, err.message);
  });

  return getPublicUrl(s3Key);
}

function deleteImageBestEffort(imageUrl) {
  const key = keyFromStoredUrl(imageUrl);
  if (!key) return;
  deleteObject(key).catch((err) => {
    console.warn(`[news] failed to delete image ${key}:`, err.message);
  });
}

/**
 * Create a post. Defaults to draft unless isPublished is passed.
 * @param {{ title: string, content: string, authorId: string,
 *           imageS3Key?: string|null, isPublished?: boolean, isPinned?: boolean }} input
 */
export async function createPost({ title, content, authorId, imageS3Key, isPublished = false, isPinned = false }) {
  if (!authorId) throw domainError('Autor requerido', 'UNAUTHORIZED');

  const imageUrl = imageS3Key ? await resolveImageKey(imageS3Key) : null;

  return newsRepository.create({
    title: title.trim(),
    content,
    imageUrl,
    isPublished,
    isPinned,
    publishedAt: isPublished ? new Date() : null,
    authorId,
  });
}

/**
 * Partial update. Publishing for the first time seals `publishedAt`;
 * unpublishing keeps the original date so re-publishing preserves order.
 * `imageS3Key` semantics: undefined = untouched, null = remove image,
 * string = replace with the newly uploaded object.
 */
export async function updatePost(id, { title, content, imageS3Key, isPublished, isPinned }) {
  const existing = await newsRepository.findById(id);
  if (!existing) throw domainError('Publicación no encontrada', 'NOT_FOUND');

  const data = {};
  if (title !== undefined) data.title = title.trim();
  if (content !== undefined) data.content = content;
  if (isPinned !== undefined) data.isPinned = isPinned;

  if (isPublished !== undefined) {
    data.isPublished = isPublished;
    if (isPublished && !existing.publishedAt) {
      data.publishedAt = new Date();
    }
  }

  let replacedImageUrl = null;
  if (imageS3Key !== undefined) {
    if (imageS3Key === null) {
      data.imageUrl = null;
      replacedImageUrl = existing.imageUrl;
    } else {
      data.imageUrl = await resolveImageKey(imageS3Key);
      if (existing.imageUrl && existing.imageUrl !== data.imageUrl) {
        replacedImageUrl = existing.imageUrl;
      }
    }
  }

  const updated = await newsRepository.update(id, data);

  // Only clean up S3 after the DB write succeeded.
  if (replacedImageUrl) deleteImageBestEffort(replacedImageUrl);

  return updated;
}

export async function deletePost(id) {
  const existing = await newsRepository.findById(id);
  if (!existing) throw domainError('Publicación no encontrada', 'NOT_FOUND');

  const deleted = await newsRepository.remove(id);
  if (existing.imageUrl) deleteImageBestEffort(existing.imageUrl);
  return deleted;
}

// Exported for tests
export const __testing = { ALLOWED_MIME_TYPES, MAX_FILE_SIZE, PREFIX, keyFromStoredUrl };
