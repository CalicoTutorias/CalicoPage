/**
 * Study material rules shared by the admin upload form and the server
 * (client-safe: no S3 or Prisma here).
 *
 * S3 layout (bucket AWS_S3_BUCKET, private — no public-read policy on this
 * prefix; every download is a short-lived presigned URL):
 *
 *   event-materials/{curso}/{YYYY-MM-DD}_{slug}/{nombre}-{6 hex}.{ext}
 *
 *   - {curso}: the event's course code in lower case (e.g. isis1225), or
 *     `sin-materia` when the event has no course. One folder per course.
 *   - {YYYY-MM-DD}_{slug}: the event's start date in Bogotá + its slug
 *     (immutable), so a course folder lists its events in date order.
 *   - {nombre}-{6 hex}.{ext}: the uploaded file name made key-safe, plus a
 *     random suffix so two uploads with the same name never overwrite.
 *
 * The key is stored in event_materials.s3_key; it is computed at upload time,
 * so moving the event's date later does not move files already uploaded.
 */

export const MATERIALS_PREFIX = 'event-materials/';
export const MAX_MATERIAL_FILE_SIZE = 100 * 1024 * 1024; // 100 MB (direct browser → S3 upload)
export const MAX_MATERIALS_PER_EVENT = 30;
export const MATERIAL_NAME_MAX = 200;

/** Allowed extensions → the Content-Type the object is stored (and signed) with. */
export const MATERIAL_TYPES = Object.freeze({
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  zip: 'application/zip',
  py: 'text/x-python',
  java: 'text/x-java-source',
  ipynb: 'application/x-ipynb+json',
});

/** `accept` attribute for the admin file picker. */
export const MATERIAL_ACCEPT = Object.keys(MATERIAL_TYPES).map((ext) => `.${ext}`).join(',');

/** Lower-case extension of a file name ('' when it has none). */
export function materialExtension(fileName) {
  const name = String(fileName ?? '');
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Content-Type for an allowed file name, or null when its extension is not allowed. */
export function materialContentType(fileName) {
  return MATERIAL_TYPES[materialExtension(fileName)] ?? null;
}

/** "Guía de Ejercicios #2" → "guia-de-ejercicios-2" (key-safe ASCII; '' when nothing is left). */
export function toKeySegment(value, max = 80) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}
