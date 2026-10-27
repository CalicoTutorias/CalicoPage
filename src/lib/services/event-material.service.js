/**
 * Event Material Service
 * Study material of an event (spec: repasos with approval + material).
 *
 * Admin upload flow (same shape as the cover images):
 *   1. generateMaterialUploadUrl → presigned PUT under the event's folder
 *      (layout in src/lib/events/event-materials.js), tagged
 *      `status=unconfirmed` so lifecycle rules cull abandoned uploads.
 *   2. The browser PUTs the file straight to S3 (no Vercel body limit).
 *   3. registerMaterial → the key must be under this event's folder,
 *      headObject proves it exists, the row is stored and the tag flips to
 *      `confirmed`.
 *
 * Students: the files of an event are downloadable only by a Confirmed
 * registrant who has already answered the post-event survey; each download
 * is a presigned GET that expires in DOWNLOAD_URL_EXPIRY seconds. The
 * objects are private (no public-read bucket policy on event-materials/).
 *
 * Admin errors carry VALIDATION_ERROR (+ rule, field) / NOT_FOUND /
 * INVALID_STATE; student errors EVENT_NOT_FOUND / MATERIALS_LOCKED /
 * MATERIAL_NOT_FOUND.
 */

import { randomUUID } from 'crypto';
import * as s3 from '../s3';
import * as eventRepo from '../repositories/event.repository';
import * as eventRegRepo from '../repositories/event-registration.repository';
import * as materialRepo from '../repositories/event-material.repository';
import * as auditService from './admin-audit.service';
import {
  MATERIALS_PREFIX, MATERIAL_NAME_MAX, MAX_MATERIALS_PER_EVENT, MAX_MATERIAL_FILE_SIZE,
  materialContentType, materialExtension, toKeySegment,
} from '../events/event-materials';
import { utcToBogotaLocalInput } from '../utils/event-format';

const { ADMIN_ACTIONS } = auditService;

export const MATERIAL_ERROR = Object.freeze({
  LOCKED: 'MATERIALS_LOCKED',
  NOT_FOUND: 'MATERIAL_NOT_FOUND',
});

const UPLOAD_URL_EXPIRY = 900; // 15 min: a 100 MB upload on a slow connection
const DOWNLOAD_URL_EXPIRY = 300; // 5 min: the link is fetched on click
const ADMIN_DOWNLOAD_URL_EXPIRY = 900;

function domainError(message, code, extra = {}) {
  const err = new Error(message);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

const invalid = (message, rule, field) => domainError(message, 'VALIDATION_ERROR', { rule, field });

// ─── Keys and names ──────────────────────────────────────────────────────

/** `event-materials/{curso}/{YYYY-MM-DD}_{slug}/` for an event (with its course). */
export function eventMaterialFolder(event) {
  const course = toKeySegment(event.course?.code, 20) || 'sin-materia';
  const date = utcToBogotaLocalInput(event.startsAt).slice(0, 10);
  return `${MATERIALS_PREFIX}${course}/${date}_${event.slug}/`;
}

/** Full key for a new upload: the folder + key-safe name + random suffix. */
function buildMaterialKey(event, fileName) {
  const ext = materialExtension(fileName);
  const base = toKeySegment(fileName.slice(0, fileName.length - ext.length - 1)) || 'archivo';
  const suffix = randomUUID().replace(/-/g, '').slice(0, 6);
  return `${eventMaterialFolder(event)}${base}-${suffix}.${ext}`;
}

/**
 * True when `s3Key` is a file directly inside one of this event's folders.
 * The folder's course/date part may differ from today's (the event was edited
 * between presign and register), the `_{slug}` folder may not.
 */
function isEventMaterialKey(event, s3Key) {
  if (typeof s3Key !== 'string' || s3Key.includes('..') || !s3Key.startsWith(MATERIALS_PREFIX)) return false;
  const parts = s3Key.slice(MATERIALS_PREFIX.length).split('/');
  return parts.length === 3 && parts.every(Boolean) && parts[1].endsWith(`_${event.slug}`);
}

/** Display name as typed by the admin: no path, no control characters, bounded. */
function cleanFileName(fileName) {
  const name = String(fileName ?? '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return name.slice(0, MATERIAL_NAME_MAX);
}

/** ASCII name for Content-Disposition (quotes and non-ASCII would break the header). */
function downloadName(fileName) {
  return String(fileName)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._ -]/g, '_')
    .slice(0, 120) || 'material';
}

function assertAllowedFile(fileName, fileSize) {
  const name = cleanFileName(fileName);
  if (!name) throw invalid('El nombre del archivo es obligatorio', 'MATERIAL_NAME_REQUIRED', 'fileName');
  const contentType = materialContentType(name);
  if (!contentType) throw invalid(`Tipo de archivo no permitido: ${name}`, 'MATERIAL_TYPE_INVALID', 'fileName');
  if (!Number.isInteger(fileSize) || fileSize <= 0) {
    throw invalid('Tamaño de archivo inválido', 'MATERIAL_SIZE_INVALID', 'fileSize');
  }
  if (fileSize > MAX_MATERIAL_FILE_SIZE) {
    throw invalid('El archivo excede el límite de tamaño', 'MATERIAL_TOO_LARGE', 'fileSize');
  }
  return { name, contentType };
}

function serializeMaterial(m) {
  return {
    id: m.id,
    fileName: m.fileName,
    mimeType: m.mimeType,
    fileSize: m.fileSize,
    createdAt: m.createdAt,
  };
}

// ─── Admin ───────────────────────────────────────────────────────────────

async function loadEvent(eventId) {
  const event = await eventRepo.findById(eventId);
  if (!event) throw domainError('Evento no encontrado', 'NOT_FOUND');
  return event;
}

/** Uploads are for a Published event (before or after it took place). */
function assertUploadable(event) {
  if (event.status !== 'Published') {
    throw domainError('Solo se puede subir material a un evento publicado', 'INVALID_STATE');
  }
}

async function assertBelowLimit(eventId) {
  if ((await materialRepo.countByEvent(eventId)) >= MAX_MATERIALS_PER_EVENT) {
    throw invalid(`Un evento admite hasta ${MAX_MATERIALS_PER_EVENT} archivos`, 'MATERIAL_LIMIT', 'fileName');
  }
}

/**
 * Presigned PUT for one material file. The client must PUT with exactly the
 * returned `contentType` and the `x-amz-tagging: status=unconfirmed` header.
 * @returns {Promise<{ uploadUrl: string, s3Key: string, contentType: string }>}
 */
export async function generateMaterialUploadUrl({ eventId, fileName, fileSize }) {
  const event = await loadEvent(eventId);
  assertUploadable(event);
  const { name, contentType } = assertAllowedFile(fileName, fileSize);
  await assertBelowLimit(eventId);

  const s3Key = buildMaterialKey(event, name);
  const uploadUrl = await s3.generateUploadUrl(s3Key, contentType, {
    expiresIn: UPLOAD_URL_EXPIRY,
    contentLength: fileSize,
    tagging: 'status=unconfirmed',
  });
  return { uploadUrl, s3Key, contentType };
}

/** Store an uploaded file as material of the event. */
export async function registerMaterial({ adminId, eventId, s3Key, fileName, request }) {
  const event = await loadEvent(eventId);
  assertUploadable(event);
  if (!isEventMaterialKey(event, s3Key)) throw invalid('La clave del archivo no es válida', 'MATERIAL_KEY_INVALID', 's3Key');
  const name = cleanFileName(fileName);
  if (!name || materialExtension(name) !== materialExtension(s3Key)) {
    throw invalid('El nombre del archivo no coincide con el archivo subido', 'MATERIAL_NAME_REQUIRED', 'fileName');
  }
  await assertBelowLimit(eventId);

  let head;
  try {
    head = await s3.headObject(s3Key);
  } catch (err) {
    if (err.code === 'NOT_FOUND') throw invalid('El archivo no se encontró en S3 (¿se subió?)', 'MATERIAL_NOT_UPLOADED', 's3Key');
    throw err;
  }
  if (typeof head.contentLength === 'number' && head.contentLength > MAX_MATERIAL_FILE_SIZE) {
    throw invalid('El archivo excede el límite de tamaño', 'MATERIAL_TOO_LARGE', 'fileSize');
  }

  let material;
  try {
    material = await materialRepo.create({
      eventId,
      s3Key,
      fileName: name,
      mimeType: materialContentType(s3Key),
      fileSize: Number(head.contentLength) || 0,
      createdById: adminId,
    });
  } catch (err) {
    if (err?.code === 'P2002') throw invalid('Este archivo ya está registrado', 'MATERIAL_DUPLICATE', 's3Key');
    throw err;
  }

  // Fire-and-forget: confirmed objects are left alone by the lifecycle rule.
  s3.setObjectTags(s3Key, { status: 'confirmed' }).catch((err) => {
    console.warn(`[event-material] failed to confirm tag for ${s3Key}:`, err?.message);
  });

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.EVENT_MATERIAL_UPLOAD,
    targetType: 'Event',
    targetId: eventId,
    payload: { slug: event.slug, materialId: material.id, fileName: name, s3Key, fileSize: material.fileSize },
    request,
  });

  return serializeMaterial(material);
}

/** Every material of the event, each with a presigned download URL for the admin. */
export async function listMaterialsAdmin(eventId) {
  await loadEvent(eventId);
  const materials = await materialRepo.findByEvent(eventId);
  return Promise.all(materials.map(async (m) => ({
    ...serializeMaterial(m),
    downloadUrl: await s3.generateDownloadUrl(m.s3Key, ADMIN_DOWNLOAD_URL_EXPIRY, { downloadName: downloadName(m.fileName) }),
  })));
}

/** Remove a material: the row first (students lose it at once), then the S3 object (best-effort). */
export async function deleteMaterial({ adminId, eventId, materialId, request }) {
  const event = await loadEvent(eventId);
  const material = await materialRepo.findForEvent(eventId, materialId);
  if (!material) throw domainError('Material no encontrado', 'NOT_FOUND');

  await materialRepo.deleteById(material.id);
  try {
    await s3.deleteObject(material.s3Key);
  } catch (err) {
    console.warn(`[event-material] could not delete ${material.s3Key} from S3:`, err?.message);
  }

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.EVENT_MATERIAL_DELETE,
    targetType: 'Event',
    targetId: eventId,
    payload: { slug: event.slug, materialId, fileName: material.fileName, s3Key: material.s3Key },
    request,
  });

  return { id: materialId };
}

// ─── Students ────────────────────────────────────────────────────────────

/**
 * The event (by slug) if the user may download its material: a Confirmed
 * registration (approved, on approval events) with a submitted survey.
 */
async function loadUnlockedEvent(slug, userId) {
  const event = await eventRepo.findBySlug(slug);
  if (!event || event.status === 'Draft') throw domainError('EVENT_NOT_FOUND', 'EVENT_NOT_FOUND');
  const registration = await eventRegRepo.findViewerRegistration(event.id, userId);
  if (registration?.status !== 'Confirmed' || !registration.surveyResponse) {
    throw domainError(MATERIAL_ERROR.LOCKED, MATERIAL_ERROR.LOCKED);
  }
  return event;
}

/** @returns {Promise<object[]>} the event's materials (no URLs: see getMaterialDownloadUrl) */
export async function listMaterialsForStudent({ slug, userId }) {
  const event = await loadUnlockedEvent(slug, userId);
  return (await materialRepo.findByEvent(event.id)).map(serializeMaterial);
}

/** @returns {Promise<{ url: string, fileName: string }>} a short-lived presigned download */
export async function getMaterialDownloadUrl({ slug, userId, materialId }) {
  const event = await loadUnlockedEvent(slug, userId);
  const material = await materialRepo.findForEvent(event.id, materialId);
  if (!material) throw domainError(MATERIAL_ERROR.NOT_FOUND, MATERIAL_ERROR.NOT_FOUND);
  const url = await s3.generateDownloadUrl(material.s3Key, DOWNLOAD_URL_EXPIRY, { downloadName: downloadName(material.fileName) });
  return { url, fileName: material.fileName };
}

/** Number of files of an event (shown, locked or not, to its Confirmed registrants). */
export async function countMaterials(eventId) {
  return materialRepo.countByEvent(eventId);
}
