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
 */

import { z } from 'zod';
import * as repo from '../repositories/marketing-piece.repository';
import { DOCUMENT_NAME_RE, FILE_NAME_RE, SLUG_RE, manifestSchema } from './marketing-post.service';

export const TYPES = ['publicacion', 'historia', 'reel', 'presentacion'];

// Source files of a piece: the HTML plus the images uploaded for it.
export const SRC_PATH_RE = /^(index\.html|img\/[a-z0-9][a-z0-9_.-]{0,80}\.(png|jpe?g|webp))$/;
const MAX_SRC_FILES = 60;
const MAX_SRC_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 30 * 1024 * 1024;
const MAX_META_CHARS = 300_000; // brief + historial serializados

const CONTENT_TYPES = {
  html: 'text/html; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
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

const srcFileSchema = z.object({
  path: z.string().regex(SRC_PATH_RE),
  size: z.number().int().min(0).max(MAX_SRC_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

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

const uploadRequestSchema = z.object({
  files: z.array(srcFileSchema.pick({ path: true, size: true })).min(1).max(MAX_SRC_FILES),
});

const publishUploadSchema = z.object({
  files: z.array(z.object({
    name: z.string().refine((n) => FILE_NAME_RE.test(n) || DOCUMENT_NAME_RE.test(n), { message: 'nombre inválido' }),
    size: z.number().int().min(1).max(MAX_OUTPUT_BYTES),
  })).min(1).max(61).refine(uniqueBy('name'), { message: 'nombres repetidos' }),
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
    createdBy: personName(p.createdBy),
    updatedBy: personName(p.updatedBy),
    publishedBy: personName(p.publishedBy),
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

/** Presigned PUT URLs (15 min) for source files; the size is signed into each URL. */
export async function requestUploads(slug, input) {
  assertSlug(slug);
  const { files } = parse(uploadRequestSchema, input);
  return Promise.all(files.map(async (f) => ({
    path: f.path,
    contentType: contentTypeOf(f.path),
    url: await repo.uploadUrl(repo.srcKey(slug, f.path), contentTypeOf(f.path), f.size),
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
    const created = await repo.createPiece({ slug, ...fields, createdById: actor.sub });
    result = { slug, version: created.version, created: true };
  } else {
    const count = await repo.updatePieceIfVersion(slug, data.baseVersion, fields);
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

/** Delete the source of a piece (row + S3 source). The published post is untouched. */
export async function deletePiece(slug) {
  assertSlug(slug);
  const p = await repo.findPiece(slug);
  if (!p) throw domainError('Pieza no encontrada', 'NOT_FOUND');
  await repo.removeKeys(await repo.listKeys(repo.srcKey(slug, '')));
  await repo.deletePieceRow(slug);
  return { slug, title: p.title };
}

/** Presigned PUT URLs for the exported PNGs/PDF of a publish. */
export async function requestPublishUploads(slug, input) {
  assertSlug(slug);
  if (!(await repo.findPiece(slug))) throw domainError('Pieza no encontrada', 'NOT_FOUND');
  const { files } = parse(publishUploadSchema, input);
  return Promise.all(files.map(async (f) => ({
    name: f.name,
    contentType: contentTypeOf(f.name),
    url: await repo.uploadUrl(repo.postKey(slug, f.name), contentTypeOf(f.name), f.size),
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
  const names = [...manifest.files.map((f) => f.name), ...(manifest.document ? [manifest.document.name] : [])];
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
export const __testing = { saveSchema, SRC_PATH_RE };
