/**
 * University email repository: the verified university email of a user and
 * the verification in progress (pending email + hashed link token).
 * Explicit selects only; the email never leaves through generic user reads
 * (user.repository strips these columns).
 */

import prisma from '../prisma';

const STATUS_SELECT = {
  id: true,
  name: true,
  universityEmail: true,
  verifiedUniversity: true,
  universityEmailVerifiedAt: true,
  pendingUniversityEmail: true,
  universityEmailTokenExpiry: true,
  universityEmailSentAt: true,
};

/** The caller's university-email state, or null when the user does not exist. */
export async function findStatus(userId) {
  return prisma.user.findUnique({ where: { id: userId }, select: STATUS_SELECT });
}

/** The user holding a verification token (by its SHA-256 hash). */
export async function findByTokenHash(tokenHash) {
  return prisma.user.findUnique({ where: { universityEmailToken: tokenHash }, select: STATUS_SELECT });
}

/** Whether another user already verified this university email. */
export async function isTakenByOther(email, userId) {
  const owner = await prisma.user.findUnique({ where: { universityEmail: email }, select: { id: true } });
  return Boolean(owner) && owner.id !== userId;
}

/** Start (or restart) a verification: the previous link stops working. */
export async function startVerification(userId, { pendingEmail, tokenHash, expiresAt, sentAt }) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      pendingUniversityEmail: pendingEmail,
      universityEmailToken: tokenHash,
      universityEmailTokenExpiry: expiresAt,
      universityEmailSentAt: sentAt,
    },
    select: STATUS_SELECT,
  });
}

/** Drop the verification in progress (expired or consumed link). */
export async function clearPending(userId) {
  return prisma.user.update({
    where: { id: userId },
    data: { pendingUniversityEmail: null, universityEmailToken: null, universityEmailTokenExpiry: null },
    select: STATUS_SELECT,
  });
}

/**
 * Mark `email` as the user's verified university email and clear the pending
 * verification. Throws Prisma P2002 when another user verified it first.
 */
export async function completeVerification(userId, { email, universityCode, verifiedAt }) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      universityEmail: email,
      verifiedUniversity: universityCode,
      universityEmailVerifiedAt: verifiedAt,
      pendingUniversityEmail: null,
      universityEmailToken: null,
      universityEmailTokenExpiry: null,
    },
    select: STATUS_SELECT,
  });
}

/**
 * Same as completeVerification, but only for a user with no university email
 * yet (granting it from an already-verified login email). Returns how many
 * rows changed (0 or 1).
 */
export async function grantIfNone(userId, { email, universityCode, verifiedAt }) {
  const { count } = await prisma.user.updateMany({
    where: { id: userId, universityEmail: null },
    data: { universityEmail: email, verifiedUniversity: universityCode, universityEmailVerifiedAt: verifiedAt },
  });
  return count;
}

/** Remove the university email, the badge and any verification in progress. */
export async function remove(userId) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      universityEmail: null,
      verifiedUniversity: null,
      universityEmailVerifiedAt: null,
      pendingUniversityEmail: null,
      universityEmailToken: null,
      universityEmailTokenExpiry: null,
    },
    select: STATUS_SELECT,
  });
}
