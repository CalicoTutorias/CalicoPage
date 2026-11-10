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
 *
 * A material can also be an external link (event_materials.url): nothing in S3.
 */

export const MATERIALS_PREFIX = 'event-materials/';
export const MAX_MATERIAL_FILE_SIZE = 100 * 1024 * 1024; // 100 MB (direct browser → S3 upload)
export const MAX_MATERIALS_PER_EVENT = 30;
export const MATERIAL_NAME_MAX = 200;
export const MATERIAL_URL_MAX = 2000;

/**
 * The canonical form of a link students may open, or null when it is not valid.
 * Only https: this ends up in an href, so `javascript:` and the like must never pass.
 */
export function normalizeMaterialUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value ?? '').trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.href.length > MATERIAL_URL_MAX) return null;
  return parsed.href;
}

/** "https://www.youtube.com/watch?v=1" → "youtube.com", to show where a link goes. */
export function materialLinkHost(url) {
  return new URL(url).hostname.replace(/^www\./, '');
}

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

/** Display name as typed: no control characters, bounded. */
export function cleanMaterialName(name) {
  return String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MATERIAL_NAME_MAX);
}

/** A file's display name: its name without any path. */
export function cleanMaterialFileName(fileName) {
  return cleanMaterialName(String(fileName ?? '').split(/[\\/]/).pop());
}

/** ASCII name for Content-Disposition (quotes and non-ASCII would break the header). */
export function materialDownloadName(fileName) {
  return String(fileName)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._ -]/g, '_')
    .slice(0, 120) || 'material';
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
