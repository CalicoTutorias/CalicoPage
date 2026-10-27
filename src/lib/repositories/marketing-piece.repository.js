/**
 * Marketing Piece Repository
 *
 * Source of the pieces created with the local content-creator tool:
 * - Postgres (`marketing_pieces`): brief/historial (`meta`), caption, file list,
 *   the optimistic-lock `version` and the agenda (plan entry, planned date and
 *   whether it is already on Instagram).
 * - S3, same private bucket as the published posts (AWS_S3_POSTS_BUCKET):
 *     marketing-pieces/{slug}/src/{path}   ← index.html, img/*, and for edited reels
 *                                            video/fuente/*.mp4 + video/*.json|html
 *   Published output is NOT here: it stays in marketing-posts/{slug}/ (see
 *   marketing-post.repository.js).
 */

import prisma from '../prisma';
import {
  deleteObjects,
  generateDownloadUrl,
  generateUploadUrl,
  headObject,
  listObjectKeys,
  uploadObject,
} from '../s3';
import { PREFIX as POSTS_PREFIX } from './marketing-post.repository';

export const SRC_PREFIX = 'marketing-pieces/';

// Read per call so tests and runtime env changes are honoured.
const bucket = () => process.env.AWS_S3_POSTS_BUCKET || undefined;
const target = () => ({ bucket: bucket() });

export const srcKey = (slug, path) => `${SRC_PREFIX}${slug}/src/${path}`;
export const postKey = (slug, name) => `${POSTS_PREFIX}${slug}/${name}`;

const userName = { select: { name: true, email: true } };

const summarySelect = {
  slug: true,
  title: true,
  type: true,
  style: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  planEntryKey: true,
  plannedFor: true,
  instagramPublishedAt: true,
  createdBy: userName,
  updatedBy: userName,
  publishedBy: userName,
  instagramPublishedBy: userName,
};

// What the agenda needs to change a piece without touching its source.
const agendaSelect = {
  slug: true,
  version: true,
  meta: true,
  plannedFor: true,
  instagramPublishedAt: true,
  instagramPublishedById: true,
};

// ── Postgres ─────────────────────────────────────

export function listPieces(limit = 500) {
  return prisma.marketingPiece.findMany({
    select: summarySelect,
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
}

export function findPiece(slug) {
  return prisma.marketingPiece.findUnique({
    where: { slug },
    select: { ...summarySelect, caption: true, meta: true, files: true },
  });
}

export function findAgenda(slug) {
  return prisma.marketingPiece.findUnique({ where: { slug }, select: agendaSelect });
}

/** Agenda of the published posts shown in Admin → Posts (one query for the whole list). */
export function listAgendaBySlugs(slugs) {
  if (!slugs.length) return Promise.resolve([]);
  return prisma.marketingPiece.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, createdAt: true, plannedFor: true, instagramPublishedAt: true, instagramPublishedBy: userName },
  });
}

export function createPiece(data) {
  return prisma.marketingPiece.create({ data, select: { slug: true, version: true, updatedAt: true } });
}

/**
 * Update only if the row still has `baseVersion` (optimistic lock).
 * @returns {Promise<number>} rows updated (0 = missing or someone saved first)
 */
export async function updatePieceIfVersion(slug, baseVersion, data) {
  const { count } = await prisma.marketingPiece.updateMany({
    where: { slug, version: baseVersion },
    data: { ...data, version: { increment: 1 } },
  });
  return count;
}

export function markPublished(slug, userId, publishedAt) {
  return prisma.marketingPiece.update({
    where: { slug },
    data: { publishedAt, publishedById: userId },
    select: { slug: true, publishedAt: true },
  });
}

export function deletePieceRow(slug) {
  return prisma.marketingPiece.delete({ where: { slug } });
}

// ── S3 ───────────────────────────────────────────

export const uploadUrl = (key, contentType, contentLength, expiresIn = 900) =>
  generateUploadUrl(key, contentType, { expiresIn, contentLength, bucket: bucket() });

export const downloadUrl = (key) => generateDownloadUrl(key, 3600, target());

export const head = (key) => headObject(key, target());

export const listKeys = (prefix) => listObjectKeys(prefix, target());

export const removeKeys = (keys) => (keys.length ? deleteObjects(keys, target()) : Promise.resolve());

export const putJson = (key, data) =>
  uploadObject(key, JSON.stringify(data, null, 2), 'application/json', target());
