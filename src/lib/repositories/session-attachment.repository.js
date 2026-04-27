/**
 * Session Attachment Repository
 * Handles database operations for session file attachments (PostgreSQL via Prisma).
 */

import prisma from '../prisma';

/**
 * Create multiple attachment records for a session.
 * @param {string} sessionId
 * @param {{ s3Key: string, fileName: string, fileSize: number, mimeType: string }[]} attachments
 */
export async function createMany(sessionId, attachments) {
  if (!attachments?.length) return [];

  await prisma.sessionAttachment.createMany({
    data: attachments.map((a) => ({
      sessionId,
      s3Key: a.s3Key,
      fileName: a.fileName,
      fileSize: a.fileSize,
      mimeType: a.mimeType,
    })),
  });

  return prisma.sessionAttachment.findMany({
    where: { sessionId },
    orderBy: { uploadedAt: 'asc' },
  });
}

/**
 * Find all attachments for a session.
 * @param {string} sessionId
 */
export async function findBySessionId(sessionId) {
  return prisma.sessionAttachment.findMany({
    where: { sessionId },
    orderBy: { uploadedAt: 'asc' },
  });
}

/**
 * Delete all attachment records for a session.
 * @param {string} sessionId
 * @returns {Promise<{ count: number }>}
 */
export async function deleteBySessionId(sessionId) {
  return prisma.sessionAttachment.deleteMany({
    where: { sessionId },
  });
}
