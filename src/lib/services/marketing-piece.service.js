/**
 * Marketing Piece Service
 *
 * Shared storage for the pieces created with the local content-creator tool,
 * so the team no longer shares them through git. Used only by
 * /api/content-creator/* (personal token, see requireContentCreator).
 *
 * Flow of a save:
 *   1. requestUploads → presigned PUT URLs; the tool uploads the files that
 *      changed straight to S3 (no Vercel body limit).
 *   2. savePiece → validates, checks every listed file exists in S3 with the
 *      declared size, stores the row with an optimistic lock on `version`,
 *      and deletes source files that are no longer listed.
 *
 * Publishing works the same way (requestPublishUploads → publishPiece) and
 * writes marketing-posts/{slug}/manifest.json last, which is what the admin
 * "Posts" page reads. The manifest schema is the same one the admin uses.
 *
 * Agenda: the tool keeps it in `meta` (planId, fechaPublicacion,
 * publicadaInstagramEn/Por); every save copies it to columns so it can be
 * listed and filtered. Admin → Posts changes it with setAgenda, which writes
 * both the columns and `meta` (and bumps `version`, so the tool pulls it).
 */

import { z } from 'zod';
import * as repo from '../repositories/marketing-piece.repository';
import { DOCUMENT_NAME_RE, FILE_NAME_RE, SLUG_RE, VIDEO_NAME_RE, manifestSchema } from './marketing-post.service';
import { calendarDate } from '../utils/calendar-date';

export const TYPES = ['publicacion', 'historia', 'reel', 'reel-editado', 'presentacion'];

// Source files of a piece: the HTML plus the images uploaded for it. An edited
// reel also keeps its clips (1080p copies made by the tool, not the phone
// originals) and the edit itself, so anyone can reopen it on another PC.
export const SRC_PATH_RE = new RegExp('^(index\\.html'
  + '|img/[a-z0-9][a-z0-9_.-]{0,80}\\.(png|jpe?g|webp)'
  + '|video/fuente/[a-z0-9][a-z0-9-]{0,60}\\.mp4'
  + '|video/(edicion|transcripcion|caras)\\.json'
  + '|video/composicion\\.html)$');
const MAX_SRC_FILES = 60;
const MAX_SRC_BYTES = 15 * 1024 * 1024;
const MAX_SRC_VIDEO_BYTES = 1024 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 30 * 1024 * 1024;
const MAX_OUTPUT_VIDEO_BYTES = 300 * 1024 * 1024; // Instagram's API limit for a reel
const MAX_META_CHARS = 300_000; // brief + historial serializados

const isVideo = (name) => name.endsWith('.mp4');
const maxSrcBytes = (path) => (isVideo(path) ? MAX_SRC_VIDEO_BYTES : MAX_SRC_BYTES);
const maxOutputBytes = (name) => (isVideo(name) ? MAX_OUTPUT_VIDEO_BYTES : MAX_OUTPUT_BYTES);
// Presigned PUT lifetime: a video can take a while on a slow connection.
const uploadTtl = (name) => (isVideo(name) ? 3600 : 900);

const CONTENT_TYPES = {
  html: 'text/html; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  json: 'application/json',
};
const contentTypeOf = (name) => CONTENT_TYPES[name.split('.').pop().toLowerCase()];

function domainError(message, code, extra = {}) {
  const err = new Error(message);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function assertSlug(slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw domainError('Identificador de pieza inválido', 'VALIDATION_ERROR');
  }
}

function parse(schema, input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw domainError(`${issue.path.join('.') || 'body'}: ${issue.message}`, 'VALIDATION_ERROR');
  }
  return parsed.data;
}

const srcFileBase = z.object({
  path: z.string().regex(SRC_PATH_RE),
  size: z.number().int().min(0),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const withinSrcLimit = [(f) => f.size <= maxSrcBytes(f.path), { message: 'archivo demasiado grande', path: ['size'] }];
const srcFileSchema = srcFileBase.refine(...withinSrcLimit);

const uniqueBy = (key) => (list) => new Set(list.map((f) => f[key])).size === list.length;

const srcListSchema = z.array(srcFileSchema).max(MAX_SRC_FILES)
  .refine(uniqueBy('path'), { message: 'rutas repetidas' });

const saveSchema = z.object({
  baseVersion: z.number().int().min(0), // 0 = crear
  title: z.string().trim().min(1).max(200),
  type: z.enum(TYPES),
  style: z.string().regex(/^[a-z0-9-]{1,60}$/).nullable().optional(),
  caption: z.string().max(5000).default(''),
  meta: z.record(z.string(), z.unknown())
    .refine((m) => JSON.stringify(m).length <= MAX_META_CHARS, { message: 'demasiado grande' }),
  files: srcListSchema.refine((l) => l.some((f) => f.path === 'index.html'), { message: 'falta index.html' }),
});

// The agenda fields the tool writes in `meta`. Other keys of `meta` are free.
const agendaMetaSchema = z.object({
  planId: z.string().regex(SLUG_RE).nullable().optional(),
  fechaPublicacion: calendarDate.schema.nullable().optional(),
  publicadaInstagramEn: calendarDate.schema.nullable().optional(),
}).passthrough();

const agendaUpdateSchema = z.object({
  plannedFor: calendarDate.schema.nullable().optional(),
  instagram: z.boolean().optional(),
  instagramDate: calendarDate.schema.optional(),
}).refine((a) => a.plannedFor !== undefined || a.instagram !== undefined, { message: 'nada que cambiar' });

const uploadRequestSchema = z.object({
  files: z.array(srcFileBase.pick({ path: true, size: true }).refine(...withinSrcLimit)).min(1).max(MAX_SRC_FILES),
});

const publishUploadSchema = z.object({
  files: z.array(z.object({
    name: z.string().refine((n) => FILE_NAME_RE.test(n) || DOCUMENT_NAME_RE.test(n) || VIDEO_NAME_RE.test(n), { message: 'nombre inválido' }),
    size: z.number().int().min(1),
  }).refine((f) => f.size <= maxOutputBytes(f.name), { message: 'archivo demasiado grande', path: ['size'] }))
    .min(1).max(62).refine(uniqueBy('name'), { message: 'nombres repetidos' }),
});

const personName = (u) => (u ? u.name || u.email : null);

function toSummary(p) {
  return {
    slug: p.slug,
    title: p.title,
    type: p.type,
    style: p.style,
    version: p.version,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    publishedAt: p.publishedAt,
    planEntryKey: p.planEntryKey ?? null,
    plannedFor: calendarDate.fromDb(p.plannedFor),
    instagramPublishedAt: calendarDate.fromDb(p.instagramPublishedAt),
    createdBy: personName(p.createdBy),
    updatedBy: personName(p.updatedBy),
    publishedBy: personName(p.publishedBy),
    instagramPublishedBy: personName(p.instagramPublishedBy),
  };
}

/**
 * Agenda columns from the tool's `meta`. Who marked it as published on Instagram is
 * kept while the date stays the same; a new date belongs to whoever saves it.
 */
function agendaColumns(meta, existing, actor) {
  const instagram = meta.publicadaInstagramEn || null;
  const sameDay = instagram && calendarDate.fromDb(existing?.instagramPublishedAt) === instagram;
  let instagramPublishedById = null;
  if (instagram) instagramPublishedById = sameDay ? existing.instagramPublishedById : actor.sub;
  return {
    planEntryKey: meta.planId || null,
    plannedFor: meta.fechaPublicacion ? calendarDate.toDb(meta.fechaPublicacion) : null,
    instagramPublishedAt: instagram ? calendarDate.toDb(instagram) : null,
    instagramPublishedById,
  };
}

/** Every piece, most recently edited first. */
export async function listPieces() {
  return (await repo.listPieces()).map(toSummary);
}

/** One piece with caption, meta and a presigned download URL per source file. */
export async function getPiece(slug) {
  assertSlug(slug);
  const p = await repo.findPiece(slug);
  if (!p) throw domainError('Pieza no encontrada', 'NOT_FOUND');
  const files = await Promise.all((p.files || []).map(async (f) => ({
    ...f,
    url: await repo.downloadUrl(repo.srcKey(slug, f.path)),
  })));
  return { ...toSummary(p), caption: p.caption, meta: p.meta, files };
}

/** Presigned PUT URLs (15 min, 1 h for videos) for source files; the size is signed into each URL. */
export async function requestUploads(slug, input) {
  assertSlug(slug);
  const { files } = parse(uploadRequestSchema, input);
  return Promise.all(files.map(async (f) => ({
    path: f.path,
    contentType: contentTypeOf(f.path),
    url: await repo.uploadUrl(repo.srcKey(slug, f.path), contentTypeOf(f.path), f.size, uploadTtl(f.path)),
  })));
}

async function assertUploaded(keysWithSize) {
  const missing = [];
  await Promise.all(keysWithSize.map(async ({ key, size, label }) => {
    try {
      const meta = await repo.head(key);
      if (meta.contentLength !== size) missing.push(`${label} (tamaño distinto)`);
    } catch (err) {
      if (err.code !== 'NOT_FOUND') throw err;
      missing.push(label);
    }
  }));
  if (missing.length) {
    throw domainError(`Archivos sin subir: ${missing.sort().join(', ')}`, 'VALIDATION_ERROR');
  }
}

/**
 * Create (baseVersion 0) or update a piece. Throws CONFLICT (with the current
 * version) when someone else saved since `baseVersion` was read.
 * @returns {Promise<{ slug: string, version: number, created: boolean }>}
 */
export async function savePiece(slug, input, actor) {
  assertSlug(slug);
  const data = parse(saveSchema, input);
  const agendaMeta = parse(agendaMetaSchema, data.meta);

  await assertUploaded(data.files.map((f) => ({ key: repo.srcKey(slug, f.path), size: f.size, label: f.path })));

  const fields = {
    title: data.title,
    type: data.type,
    style: data.style ?? null,
    caption: data.caption,
    meta: data.meta,
    files: data.files,
    updatedById: actor.sub,
  };

  let result;
  if (data.baseVersion === 0) {
    const existing = await repo.findPiece(slug);
    if (existing) {
      throw domainError('La pieza ya existe', 'CONFLICT', { currentVersion: existing.version });
    }
    const created = await repo.createPiece({ slug, ...fields, ...agendaColumns(agendaMeta, null, actor), createdById: actor.sub });
    result = { slug, version: created.version, created: true };
  } else {
    const agenda = agendaColumns(agendaMeta, await repo.findAgenda(slug), actor);
    const count = await repo.updatePieceIfVersion(slug, data.baseVersion, { ...fields, ...agenda });
    if (count === 0) {
      const current = await repo.findPiece(slug);
      if (!current) throw domainError('Pieza no encontrada', 'NOT_FOUND');
      throw domainError('Otra persona guardó esta pieza antes', 'CONFLICT', { currentVersion: current.version });
    }
    result = { slug, version: data.baseVersion + 1, created: false };
  }

  // Source files dropped from the list are removed from S3.
  const prefix = repo.srcKey(slug, '');
  const keep = new Set(data.files.map((f) => repo.srcKey(slug, f.path)));
  const stale = (await repo.listKeys(prefix)).filter((k) => !keep.has(k));
  await repo.removeKeys(stale);

  return result;
}

/**
 * Change the agenda from Admin → Posts: the planned date and/or whether it is
 * already on Instagram (someone uploads it by hand; here it is only confirmed).
 * Writes the columns and the tool's `meta` together and bumps `version`, so the
 * tool downloads the new `meta` the next time it opens the piece.
 * @param {{ plannedFor?: string|null, instagram?: boolean, instagramDate?: string }} input
 */
export async function setAgenda(slug, input, actor) {
  assertSlug(slug);
  const data = parse(agendaUpdateSchema, input);
  const piece = await repo.findAgenda(slug);
  if (!piece) throw domainError('Pieza no encontrada', 'NOT_FOUND');

  const meta = { ...(piece.meta || {}) };
  const columns = {};
  if (data.plannedFor !== undefined) {
    meta.fechaPublicacion = data.plannedFor;
    columns.plannedFor = data.plannedFor ? calendarDate.toDb(data.plannedFor) : null;
  }
  if (data.instagram !== undefined) {
    const day = data.instagram ? (data.instagramDate || calendarDate.today()) : null;
    meta.publicadaInstagramEn = day;
    meta.publicadaInstagramPor = day ? actor.name || actor.email || null : null;
    columns.instagramPublishedAt = day ? calendarDate.toDb(day) : null;
    columns.instagramPublishedById = day ? actor.sub : null;
  }

  const count = await repo.updatePieceIfVersion(slug, piece.version, { ...columns, meta, updatedById: actor.sub });
  if (count === 0) throw domainError('La pieza cambió mientras tanto; recarga e inténtalo de nuevo', 'CONFLICT', { currentVersion: piece.version });
  return {
    slug,
    version: piece.version + 1,
    plannedFor: meta.fechaPublicacion ?? null,
    instagramPublishedAt: meta.publicadaInstagramEn ?? null,
  };
}

/** Delete the source of a piece (row + S3 source). The published post is untouched. */
export async function deletePiece(slug) {
  assertSlug(slug);
  const p = await repo.findPiece(slug);
  if (!p) throw domainError('Pieza no encontrada', 'NOT_FOUND');
  await repo.removeKeys(await repo.listKeys(repo.srcKey(slug, '')));
  await repo.deletePieceRow(slug);
  return { slug, title: p.title };
}

/** Presigned PUT URLs for the exported PNGs/PDF/MP4 of a publish. */
export async function requestPublishUploads(slug, input) {
  assertSlug(slug);
  if (!(await repo.findPiece(slug))) throw domainError('Pieza no encontrada', 'NOT_FOUND');
  const { files } = parse(publishUploadSchema, input);
  return Promise.all(files.map(async (f) => ({
    name: f.name,
    contentType: contentTypeOf(f.name),
    url: await repo.uploadUrl(repo.postKey(slug, f.name), contentTypeOf(f.name), f.size, uploadTtl(f.name)),
  })));
}

/**
 * Finish a publish: validate the manifest with the admin's own schema, check
 * every file is in S3, drop files from an older publish and write
 * manifest.json last (a folder without it is ignored by the admin).
 */
export async function publishPiece(slug, input, actor) {
  assertSlug(slug);
  if (!(await repo.findPiece(slug))) throw domainError('Pieza no encontrada', 'NOT_FOUND');

  const manifest = parse(manifestSchema, input?.manifest);
  if (manifest.slug !== slug) throw domainError('manifest.slug no coincide con la pieza', 'VALIDATION_ERROR');
  if (!manifest.caption.includes('calico-tutorias.com')) {
    throw domainError('El caption no menciona calico-tutorias.com', 'VALIDATION_ERROR');
  }
  const sizes = input?.sizes && typeof input.sizes === 'object' ? input.sizes : {};
  const names = [
    ...manifest.files.map((f) => f.name),
    ...(manifest.document ? [manifest.document.name] : []),
    ...(manifest.video ? [manifest.video.name] : []),
  ];
  const withSize = names.map((name) => ({ key: repo.postKey(slug, name), size: sizes[name], label: name }));
  if (withSize.some((f) => !Number.isInteger(f.size))) {
    throw domainError('Falta el tamaño de algún archivo (sizes)', 'VALIDATION_ERROR');
  }
  await assertUploaded(withSize);

  const keep = new Set([...withSize.map((f) => f.key), repo.postKey(slug, 'manifest.json')]);
  const stale = (await repo.listKeys(repo.postKey(slug, ''))).filter((k) => !keep.has(k));
  await repo.removeKeys(stale);

  const publishedAt = new Date();
  await repo.putJson(repo.postKey(slug, 'manifest.json'), { ...manifest, publishedAt: publishedAt.toISOString() });
  await repo.markPublished(slug, actor.sub, publishedAt);
  return { slug, publishedAt, files: names.length };
}

// Exported for tests
export const __testing = { saveSchema, SRC_PATH_RE, agendaColumns };
