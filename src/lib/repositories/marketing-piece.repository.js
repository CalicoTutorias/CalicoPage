/**
 * Marketing Piece Repository
 *
 * Source of the pieces created with the local content-creator tool:
 * - Postgres (`marketing_pieces`): brief/historial (`meta`), caption, file list
 *   and the optimistic-lock `version`.
 * - S3, same private bucket as the published posts (AWS_S3_POSTS_BUCKET):
 *     marketing-pieces/{slug}/src/{path}   ← index.html, img/*
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
  createdBy: userName,
  updatedBy: userName,
  publishedBy: userName,
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

export const uploadUrl = (key, contentType, contentLength) =>
  generateUploadUrl(key, contentType, { expiresIn: 900, contentLength, bucket: bucket() });

export const downloadUrl = (key) => generateDownloadUrl(key, 3600, target());

export const head = (key) => headObject(key, target());

export const listKeys = (prefix) => listObjectKeys(prefix, target());

export const removeKeys = (keys) => (keys.length ? deleteObjects(keys, target()) : Promise.resolve());

export const putJson = (key, data) =>
  uploadObject(key, JSON.stringify(data, null, 2), 'application/json', target());
