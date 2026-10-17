/**
 * Marketing Post Service
 *
 * Admin-only library of Instagram posts (carrusel, post, historia, reel cover),
 * edited video reels and slide presentations generated locally with the
 * content-creator tool and published to S3. A presentation ships its slides as
 * PNG previews plus one PDF (`manifest.document`), which is what gets downloaded.
 * A video reel (`format: 'video'`) ships the MP4 (`manifest.video`) plus its cover
 * PNG; both are downloaded, and the page plays the video from a presigned URL.
 * The caption is only what gets pasted into Instagram: a reel's shooting script
 * (`script`) and the cover's alt text (`coverAlt`) travel apart, each with its
 * own copy button.
 * The panel only reads and deletes — creation happens in the local tool so the
 * rendering stack (Playwright, fonts) never ships with the app.
 *
 * Files are private: the list/detail hand out short-lived presigned GET URLs
 * for previews, and downloads go through an authenticated API proxy so the
 * browser gets same-origin blobs (needed for the Web Share API on phones,
 * without configuring CORS on the bucket).
 */

import { z } from 'zod';
import * as marketingPostRepository from '../repositories/marketing-post.repository';

const PREVIEW_URL_TTL = 3600; // 1 h — enough for a review session.
const MAX_POSTS = 200;

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;
export const FILE_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,60}\.png$/;
export const DOCUMENT_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,60}\.pdf$/;
export const VIDEO_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,60}\.mp4$/;

const FORMATS = ['carrusel', 'post', 'historia', 'reel', 'cuadrado', 'mixto', 'presentacion', 'video'];

const CONTENT_TYPES = { png: 'image/png', pdf: 'application/pdf', mp4: 'video/mp4' };

const manifestSchema = z.object({
  version: z.literal(1),
  slug: z.string().regex(SLUG_RE),
  title: z.string().trim().min(1).max(200),
  format: z.enum(FORMATS),
  caption: z.string().max(5000).default(''),
  // Reel (cover + script): how to shoot it. Never part of the caption.
  script: z.string().max(10000).optional(),
  // Alt text of the cover (files[0]) for feed posts. Instagram's API takes up to 1,000 characters;
  // content-creator keeps it to ~100, what the app's field shows.
  coverAlt: z.string().trim().max(1000).optional(),
  createdAt: z.string().datetime().optional(),
  publishedAt: z.string().datetime().optional(),
  files: z
    .array(z.object({
      name: z.string().regex(FILE_NAME_RE),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }))
    .min(1)
    .max(60),
  document: z.object({
    name: z.string().regex(DOCUMENT_NAME_RE),
    pages: z.number().int().positive(),
  }).optional(),
  // Instagram accepts reels of up to 15 min through its API.
  video: z.object({
    name: z.string().regex(VIDEO_NAME_RE),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    duration: z.number().positive().max(900),
  }).optional(),
}).refine(
  // A presentation is its PDF; everything else is images only.
  (m) => (m.format === 'presentacion') === Boolean(m.document),
  { message: 'document is required for (and only for) presentacion', path: ['document'] },
).refine(
  // A video reel is its MP4 (files[0] is the cover).
  (m) => (m.format === 'video') === Boolean(m.video),
  { message: 'video is required for (and only for) the video format', path: ['video'] },
);

function domainError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function assertSlug(slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw domainError('Identificador de post inválido', 'VALIDATION_ERROR');
  }
}

/**
 * Load and validate a manifest. Returns null when it is missing or invalid, or
 * when its slug does not match the folder (a copied manifest must not point at
 * another post's files).
 */
async function loadManifest(slug) {
  let raw;
  try {
    raw = await marketingPostRepository.findManifest(slug);
  } catch (err) {
    console.warn(`[marketing-post] unreadable manifest for ${slug}:`, err.message);
    return null;
  }
  if (!raw) return null;

  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success || parsed.data.slug !== slug) {
    console.warn(`[marketing-post] invalid manifest for ${slug}`);
    return null;
  }
  return parsed.data;
}

const sortDate = (m) => m.publishedAt || m.createdAt || '';

/**
 * Every complete post, newest first, with a presigned cover URL.
 * @returns {Promise<Array<{ slug, title, format, createdAt, publishedAt, slideCount, cover }>>}
 */
export async function listPosts() {
  const slugs = (await marketingPostRepository.listSlugs())
    .filter((s) => SLUG_RE.test(s))
    .slice(0, MAX_POSTS);

  const manifests = (await Promise.all(slugs.map(loadManifest))).filter(Boolean);
  manifests.sort((a, b) => sortDate(b).localeCompare(sortDate(a)));

  return Promise.all(manifests.map(async (m) => {
    const [first] = m.files;
    return {
      slug: m.slug,
      title: m.title,
      format: m.format,
      createdAt: m.createdAt ?? null,
      publishedAt: m.publishedAt ?? null,
      slideCount: m.files.length,
      hasDocument: Boolean(m.document),
      videoDuration: m.video?.duration ?? null,
      cover: {
        name: first.name,
        width: first.width,
        height: first.height,
        url: await marketingPostRepository.getFileUrl(m.slug, first.name, PREVIEW_URL_TTL),
      },
    };
  }));
}

/** One post with caption (plus script and cover alt text, if any) and presigned preview URLs for every file. */
export async function getPost(slug) {
  assertSlug(slug);
  const m = await loadManifest(slug);
  if (!m) throw domainError('Post no encontrado', 'NOT_FOUND');

  const files = await Promise.all(m.files.map(async (f) => ({
    ...f,
    url: await marketingPostRepository.getFileUrl(slug, f.name, PREVIEW_URL_TTL),
  })));

  return {
    slug: m.slug,
    title: m.title,
    format: m.format,
    caption: m.caption,
    script: m.script || null,
    coverAlt: m.coverAlt || null,
    createdAt: m.createdAt ?? null,
    publishedAt: m.publishedAt ?? null,
    files,
    document: m.document ?? null,
    video: m.video
      ? { ...m.video, url: await marketingPostRepository.getFileUrl(slug, m.video.name, PREVIEW_URL_TTL) }
      : null,
  };
}

/**
 * Stream a single PNG (or the presentation PDF, or the reel MP4). Only names listed in the
 * manifest are served, so the proxy can never be used to read the manifest or
 * any other bucket object. Adds `contentType` for the response header.
 */
export async function getPostFile(slug, name) {
  assertSlug(slug);
  if (typeof name !== 'string' || !(FILE_NAME_RE.test(name) || DOCUMENT_NAME_RE.test(name) || VIDEO_NAME_RE.test(name))) {
    throw domainError('Nombre de archivo inválido', 'VALIDATION_ERROR');
  }
  const m = await loadManifest(slug);
  if (!m || !(m.files.some((f) => f.name === name) || m.document?.name === name || m.video?.name === name)) {
    throw domainError('Archivo no encontrado', 'NOT_FOUND');
  }
  const file = await marketingPostRepository.getFile(slug, name);
  return { ...file, contentType: CONTENT_TYPES[name.split('.').pop()] };
}

/** Delete a post and all its files. */
export async function deletePost(slug) {
  assertSlug(slug);
  const m = await loadManifest(slug);
  if (!m) throw domainError('Post no encontrado', 'NOT_FOUND');
  const removed = await marketingPostRepository.removeAll(slug);
  return { slug, title: m.title, removed };
}

// Also used by marketing-piece.service to validate a publish request.
export { manifestSchema };

// Exported for tests
export const __testing = { manifestSchema, FORMATS };
