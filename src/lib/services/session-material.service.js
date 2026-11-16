/**
 * Session Material Service
 * Study material of one tutoring session, going from the tutor or an admin to
 * the student. session_attachments is the opposite direction (the student's files
 * for the tutor) and has no lock, which is why this is a table of its own.
 *
 * Same idea as the material of a repaso: no review, no material. The student gets
 * the list and the downloads only after leaving a review with a comment, which is
 * what shows up on the tutor's public profile (reviews are public as soon as they
 * are `done`). While locked they only learn how many files there are.
 *
 * Upload flow: presigned PUT under session-materials/{sessionId}/ tagged
 * `status=unconfirmed`, browser PUT, then registerMaterial checks the key and the
 * object and flips the tag. Objects are private: every download is a presigned GET.
 *
 * `actor` is { id, isAdmin }, resolved by the route from the JWT and the database.
 * Errors carry a business code; the HTTP map is in the routes' _shared.js.
 */

import { randomUUID } from 'crypto';
import * as s3 from '../s3';
import * as materialRepo from '../repositories/session-material.repository';
import * as reviewRepo from '../repositories/review.repository';
import * as sessionRepo from '../repositories/session.repository';
import * as auditService from './admin-audit.service';
import {
  MAX_MATERIAL_FILE_SIZE,
  cleanMaterialFileName,
  materialContentType,
  materialDownloadName,
  materialExtension,
  toKeySegment,
} from '../events/event-materials';

const { ADMIN_ACTIONS } = auditService;

const MATERIALS_PREFIX = 'session-materials/';
const MAX_MATERIALS_PER_SESSION = 20;
const UPLOAD_URL_EXPIRY = 900; // 15 min: a 100 MB upload on a slow connection
const DOWNLOAD_URL_EXPIRY = 300; // 5 min: the link is fetched on click
const CLOSED_STATUSES = new Set(['Canceled', 'Rejected']);

function materialError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

async function loadSession(sessionId) {
  const session = await sessionRepo.findById(sessionId);
  if (!session) throw materialError('SESSION_NOT_FOUND');
  return session;
}

function accessOf(session, actor) {
  const isTutor = session.tutorId === actor.id;
  return {
    isTutor,
    canManage: isTutor || actor.isAdmin,
    isStudent: Boolean(session.participants?.some((p) => p.studentId === actor.id)),
  };
}

/**
 * Why this student cannot download yet, or null when they can. A review without
 * a comment does not count: the comment on the tutor's profile is the deal.
 */
async function lockReason(session, studentId) {
  const reviews = await reviewRepo.findBySession(session.id);
  const review = reviews.find((r) => (
    r.studentId === studentId && r.tutorId === session.tutorId && r.status === 'done' && r.rating != null
  ));
  if (!review) return 'REVIEW_REQUIRED';
  return review.comment?.trim() ? null : 'COMMENT_REQUIRED';
}

function assertCanUpload(session, actor) {
  if (!accessOf(session, actor).canManage) throw materialError('FORBIDDEN');
  if (CLOSED_STATUSES.has(session.status)) throw materialError('SESSION_NOT_ELIGIBLE');
}

async function assertBelowLimit(sessionId) {
  if (await materialRepo.countBySession(sessionId) >= MAX_MATERIALS_PER_SESSION) throw materialError('MATERIAL_LIMIT');
}

function assertAllowedFile(fileName, fileSize) {
  const name = cleanMaterialFileName(fileName);
  if (!name) throw materialError('MATERIAL_NAME_REQUIRED');
  const contentType = materialContentType(name);
  if (!contentType) throw materialError('MATERIAL_TYPE_INVALID');
  if (!Number.isInteger(fileSize) || fileSize <= 0) throw materialError('MATERIAL_SIZE_INVALID');
  if (fileSize > MAX_MATERIAL_FILE_SIZE) throw materialError('MATERIAL_TOO_LARGE');
  return { name, contentType };
}

function buildKey(sessionId, fileName) {
  const ext = materialExtension(fileName);
  const base = toKeySegment(fileName.slice(0, fileName.length - ext.length - 1)) || 'archivo';
  const suffix = randomUUID().replace(/-/g, '').slice(0, 6);
  return `${MATERIALS_PREFIX}${sessionId}/${base}-${suffix}.${ext}`;
}

/** True when `s3Key` is a file directly inside this session's folder. */
function isKeyOfSession(sessionId, s3Key) {
  const folder = `${MATERIALS_PREFIX}${sessionId}/`;
  if (typeof s3Key !== 'string' || s3Key.includes('..') || !s3Key.startsWith(folder)) return false;
  const name = s3Key.slice(folder.length);
  return Boolean(name) && !name.includes('/');
}

function serializeMaterial(m) {
  return { id: m.id, fileName: m.fileName, mimeType: m.mimeType, fileSize: m.fileSize, createdAt: m.createdAt };
}

/** Whoever manages the session also sees who left each file and what they may remove. */
function serializeForManager(m, session, actor) {
  return {
    ...serializeMaterial(m),
    uploadedByTutor: m.createdById === session.tutorId,
    canDelete: actor.isAdmin || m.createdById === actor.id,
  };
}

/** Admins go to the audit log; a tutor working on their own session does not. */
async function auditIfAdmin(session, actor, action, payload, request) {
  if (!actor.isAdmin || session.tutorId === actor.id) return;
  await auditService.logAction({
    adminId: actor.id,
    action,
    targetType: 'Session',
    targetId: session.id,
    payload,
    request,
  });
}

// ─── Reading ─────────────────────────────────────────────────────────────

/**
 * What this user sees of the session's material.
 * @returns {Promise<{ canManage, canUpload, locked, lockReason, count, materials }>}
 */
export async function listMaterials({ sessionId, actor }) {
  const session = await loadSession(sessionId);
  const { canManage, isStudent } = accessOf(session, actor);
  if (!canManage && !isStudent) throw materialError('FORBIDDEN');

  const materials = await materialRepo.findBySession(sessionId);
  if (canManage) {
    return {
      canManage: true,
      canUpload: !CLOSED_STATUSES.has(session.status),
      locked: false,
      lockReason: null,
      count: materials.length,
      materials: materials.map((m) => serializeForManager(m, session, actor)),
    };
  }

  const reason = await lockReason(session, actor.id);
  return {
    canManage: false,
    canUpload: false,
    locked: Boolean(reason),
    lockReason: reason,
    count: materials.length,
    materials: reason ? [] : materials.map(serializeMaterial),
  };
}

/** @returns {Promise<{ url: string, fileName: string }>} a short-lived presigned download */
export async function getMaterialDownloadUrl({ sessionId, materialId, actor }) {
  const session = await loadSession(sessionId);
  const { canManage, isStudent } = accessOf(session, actor);
  if (!canManage) {
    if (!isStudent) throw materialError('FORBIDDEN');
    if (await lockReason(session, actor.id)) throw materialError('MATERIALS_LOCKED');
  }

  const material = await materialRepo.findForSession(sessionId, materialId);
  if (!material) throw materialError('MATERIAL_NOT_FOUND');

  const url = await s3.generateDownloadUrl(material.s3Key, DOWNLOAD_URL_EXPIRY, {
    downloadName: materialDownloadName(material.fileName),
  });
  return { url, fileName: material.fileName };
}

// ─── Upload ──────────────────────────────────────────────────────────────

/**
 * Presigned PUT for one file. The client must PUT with exactly the returned
 * `contentType` and the `x-amz-tagging: status=unconfirmed` header.
 */
export async function generateUploadUrl({ sessionId, actor, fileName, fileSize }) {
  const session = await loadSession(sessionId);
  assertCanUpload(session, actor);
  const { name, contentType } = assertAllowedFile(fileName, fileSize);
  await assertBelowLimit(sessionId);

  const s3Key = buildKey(sessionId, name);
  const uploadUrl = await s3.generateUploadUrl(s3Key, contentType, {
    expiresIn: UPLOAD_URL_EXPIRY,
    contentLength: fileSize,
    tagging: 'status=unconfirmed',
  });
  return { uploadUrl, s3Key, contentType };
}

/** Store an uploaded file as material of the session. */
export async function registerMaterial({ sessionId, actor, s3Key, fileName, request }) {
  const session = await loadSession(sessionId);
  assertCanUpload(session, actor);
  if (!isKeyOfSession(sessionId, s3Key)) throw materialError('MATERIAL_KEY_INVALID');

  const name = cleanMaterialFileName(fileName);
  if (!name || materialExtension(name) !== materialExtension(s3Key)) throw materialError('MATERIAL_NAME_REQUIRED');
  const mimeType = materialContentType(s3Key);
  if (!mimeType) throw materialError('MATERIAL_TYPE_INVALID');
  await assertBelowLimit(sessionId);

  let head;
  try {
    head = await s3.headObject(s3Key);
  } catch (err) {
    if (err.code === 'NOT_FOUND') throw materialError('MATERIAL_NOT_UPLOADED');
    throw err;
  }
  if (typeof head.contentLength === 'number' && head.contentLength > MAX_MATERIAL_FILE_SIZE) {
    throw materialError('MATERIAL_TOO_LARGE');
  }

  let material;
  try {
    material = await materialRepo.create({
      sessionId,
      s3Key,
      fileName: name,
      mimeType,
      fileSize: Number(head.contentLength) || 0,
      createdById: actor.id,
    });
  } catch (err) {
    if (err?.code === 'P2002') throw materialError('MATERIAL_DUPLICATE');
    throw err;
  }

  // Awaited: the lifecycle rule deletes whatever stays `unconfirmed`.
  try {
    await s3.setObjectTags(s3Key, { status: 'confirmed' });
  } catch (err) {
    console.error(`[session-material] Failed to confirm the tag of ${s3Key}: ${err.message}`);
  }

  await auditIfAdmin(session, actor, ADMIN_ACTIONS.SESSION_MATERIAL_UPLOAD, {
    materialId: material.id,
    fileName: name,
    s3Key,
    fileSize: material.fileSize,
  }, request);

  return serializeForManager(material, session, actor);
}

/**
 * Remove a material: the row first (the student loses it at once), then the S3
 * object (best-effort). A tutor only removes their own files; an admin, any.
 */
export async function deleteMaterial({ sessionId, materialId, actor, request }) {
  const session = await loadSession(sessionId);
  if (!accessOf(session, actor).canManage) throw materialError('FORBIDDEN');

  const material = await materialRepo.findForSession(sessionId, materialId);
  if (!material) throw materialError('MATERIAL_NOT_FOUND');
  if (!actor.isAdmin && material.createdById !== actor.id) throw materialError('FORBIDDEN');

  await materialRepo.deleteById(material.id);
  try {
    await s3.deleteObject(material.s3Key);
  } catch (err) {
    console.warn(`[session-material] Could not delete ${material.s3Key} from S3: ${err.message}`);
  }

  await auditIfAdmin(session, actor, ADMIN_ACTIONS.SESSION_MATERIAL_DELETE, {
    materialId,
    fileName: material.fileName,
    s3Key: material.s3Key,
  }, request);

  return { id: materialId };
}
