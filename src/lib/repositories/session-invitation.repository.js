/**
 * Session Invitation Repository
 * Invitations to a group tutoring session (PostgreSQL via Prisma).
 *
 * Model: SessionInvitation. Business rules live in
 * src/lib/services/session-invitation.service.js; this file only guarantees
 * that the writes that race (two guests taking the last seat, a seat invited
 * twice) are decided inside one transaction with the session row locked.
 */

import prisma from '../prisma';
import { INVITATION_MAX_PER_SESSION } from '../sessions/group-session';

const ACTIVE_SESSION_STATUSES = ['Pending', 'Accepted'];

// What an invitation shows of its session. No emails, no payment, no Meet
// link: the preview is readable by anyone holding the link.
const SESSION_PREVIEW_SELECT = {
  id: true,
  status: true,
  sessionType: true,
  maxCapacity: true,
  startTimestamp: true,
  endTimestamp: true,
  tutorId: true,
  course: { select: { id: true, name: true, code: true } },
  tutor: { select: { id: true, name: true, profilePictureUrl: true } },
  _count: { select: { participants: true } },
};

const INVITATION_WITH_SESSION = {
  session: { select: SESSION_PREVIEW_SELECT },
  invitedBy: { select: { id: true, name: true } },
};

function coded(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/** Lock the session row for the rest of the transaction. */
async function lockSession(tx, sessionId) {
  const rows = await tx.$queryRaw`
    SELECT id, status, tutor_id AS "tutorId", max_capacity AS "maxCapacity",
           start_timestamp AS "startTimestamp", session_type::text AS "sessionType"
    FROM sessions WHERE id = ${sessionId} FOR UPDATE`;
  return rows[0] ?? null;
}

// ===== READS =====

export function findById(id) {
  return prisma.sessionInvitation.findUnique({ where: { id }, include: INVITATION_WITH_SESSION });
}

export function findByTokenHash(tokenHash) {
  return prisma.sessionInvitation.findUnique({ where: { tokenHash }, include: INVITATION_WITH_SESSION });
}

/** Every invitation of a session, oldest first (the organiser's list). */
export function findBySession(sessionId) {
  return prisma.sessionInvitation.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, email: true, status: true, sentCount: true, lastSentAt: true, respondedAt: true, createdAt: true,
      acceptedBy: { select: { id: true, name: true } },
    },
  });
}

export function countPendingBySession(sessionId) {
  return prisma.sessionInvitation.count({ where: { sessionId, status: 'Pending' } });
}

/** Pending invitations addressed to any of `emails`, for sessions still to come. */
export function findPendingByEmails(emails, now = new Date()) {
  if (!emails?.length) return Promise.resolve([]);
  return prisma.sessionInvitation.findMany({
    where: {
      email: { in: emails },
      status: 'Pending',
      session: { status: { in: ACTIVE_SESSION_STATUSES }, startTimestamp: { gt: now } },
    },
    orderBy: { createdAt: 'desc' },
    include: INVITATION_WITH_SESSION,
  });
}

/** The addresses a user can be invited at: their login email and a verified university one. */
export async function findUserEmails(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, universityEmail: true, universityEmailVerifiedAt: true },
  });
  if (!user) return [];
  const emails = [user.email];
  if (user.universityEmail && user.universityEmailVerifiedAt) emails.push(user.universityEmail);
  return [...new Set(emails.filter(Boolean).map((e) => e.toLowerCase()))];
}

/** Accounts registered with any of `emails` (to notify them in-app). Lowercased match. */
export function findAccountsByEmails(emails) {
  if (!emails?.length) return Promise.resolve([]);
  return prisma.user.findMany({
    where: {
      OR: [
        { email: { in: emails, mode: 'insensitive' } },
        { universityEmail: { in: emails, mode: 'insensitive' }, universityEmailVerifiedAt: { not: null } },
      ],
    },
    select: { id: true, name: true, email: true, universityEmail: true },
  });
}

// ===== WRITES =====

/**
 * Invite `emails` to a session, atomically and idempotently.
 *
 * Under the session lock: a seat is free when participants + pending
 * invitations < maxCapacity. An address already invited is revived (new
 * token, Pending) when it had declined or been revoked, and skipped when it
 * is still pending or already accepted — so a webhook and a confirm-payment
 * landing together invite each guest once.
 *
 * @param {{ sessionId: string, invitedById: string, invites: { email: string, tokenHash: string }[] }} args
 * @returns {Promise<{ created: object[], skipped: { email: string, reason: string }[] }>}
 *   `created` rows are the ones whose email must be sent (with the token the caller holds).
 */
export async function inviteMany({ sessionId, invitedById, invites }) {
  return prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (!session) throw coded('Session not found', 'NOT_FOUND');

    const [participants, existing] = await Promise.all([
      tx.sessionParticipant.count({ where: { sessionId } }),
      tx.sessionInvitation.findMany({ where: { sessionId }, select: { id: true, email: true, status: true } }),
    ]);
    const byEmail = new Map(existing.map((row) => [row.email, row]));
    let pending = existing.filter((row) => row.status === 'Pending').length;
    let total = existing.length;

    const created = [];
    const skipped = [];
    for (const { email, tokenHash } of invites) {
      const row = byEmail.get(email);
      if (row && (row.status === 'Pending' || row.status === 'Accepted')) {
        skipped.push({ email, reason: 'ALREADY_INVITED' });
        continue;
      }
      if (participants + pending >= session.maxCapacity) {
        skipped.push({ email, reason: 'NO_SEATS_LEFT' });
        continue;
      }
      if (!row && total >= INVITATION_MAX_PER_SESSION) {
        skipped.push({ email, reason: 'INVITATION_LIMIT' });
        continue;
      }
      const saved = row
        ? await tx.sessionInvitation.update({
            where: { id: row.id },
            data: { status: 'Pending', tokenHash, invitedById, acceptedById: null, respondedAt: null },
          })
        : await tx.sessionInvitation.create({ data: { sessionId, email, tokenHash, invitedById } });
      if (!row) total += 1;
      pending += 1;
      byEmail.set(email, saved);
      created.push(saved);
    }
    return { created, skipped };
  });
}

/** Record that the invitation email went out (or was re-sent with a new token). */
export function markSent(id, { tokenHash } = {}, now = new Date()) {
  return prisma.sessionInvitation.update({
    where: { id },
    data: { sentCount: { increment: 1 }, lastSentAt: now, ...(tokenHash ? { tokenHash } : {}) },
  });
}

/**
 * Take the seat of a pending invitation.
 *
 * Under the session lock, so two guests cannot both take the last seat and a
 * link cannot be used twice: the invitation must still be Pending, the session
 * active and not started, and the user neither its tutor nor already in it.
 *
 * @returns {Promise<{ outcome: 'joined' | 'already-joined' }>}
 * @throws coded: NOT_FOUND | INVITATION_NOT_PENDING | SESSION_NOT_ACTIVE |
 *   SESSION_STARTED | SELF_BOOKING | SESSION_FULL
 */
export async function accept({ invitationId, userId, now = new Date() }) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.sessionInvitation.findUnique({ where: { id: invitationId }, select: { sessionId: true } });
    if (!found) throw coded('Invitation not found', 'NOT_FOUND');

    const session = await lockSession(tx, found.sessionId);
    if (!session) throw coded('Session not found', 'NOT_FOUND');
    // Re-read under the lock: a concurrent accept/revoke has already committed.
    const invitation = await tx.sessionInvitation.findUnique({ where: { id: invitationId } });

    const alreadyIn = await tx.sessionParticipant.count({ where: { sessionId: session.id, studentId: userId } });
    if (alreadyIn > 0) {
      // Their own link clicked twice: nothing to do. Someone else's link: it
      // stays pending for whoever it was meant for.
      if (invitation.status === 'Accepted' && invitation.acceptedById === userId) return { outcome: 'already-joined' };
      throw coded('Ya estás en esta tutoría', 'ALREADY_JOINED');
    }
    if (invitation.status !== 'Pending') throw coded('La invitación ya no está disponible', 'INVITATION_NOT_PENDING');
    if (!ACTIVE_SESSION_STATUSES.includes(session.status)) throw coded('La tutoría ya no está activa', 'SESSION_NOT_ACTIVE');
    if (new Date(session.startTimestamp).getTime() <= now.getTime()) throw coded('La tutoría ya empezó', 'SESSION_STARTED');
    if (session.tutorId === userId) throw coded('El tutor no puede unirse como estudiante', 'SELF_BOOKING');

    const participants = await tx.sessionParticipant.count({ where: { sessionId: session.id } });
    if (participants >= session.maxCapacity) throw coded('La tutoría grupal está llena', 'SESSION_FULL');

    await tx.sessionParticipant.create({ data: { sessionId: session.id, studentId: userId } });
    await tx.sessionInvitation.update({
      where: { id: invitationId },
      data: { status: 'Accepted', acceptedById: userId, respondedAt: now },
    });
    return { outcome: 'joined' };
  });
}

/** Pending → Declined / Revoked. False when it was no longer pending. */
export async function closePending(id, status, now = new Date()) {
  const { count } = await prisma.sessionInvitation.updateMany({
    where: { id, status: 'Pending' },
    data: { status, respondedAt: now },
  });
  return count > 0;
}

/**
 * A guest leaves: their seat is freed and their invitation closes as Declined
 * (the organiser can invite that address again, or another one).
 *
 * @returns {Promise<boolean>} false when the user was not a participant
 */
export async function leave({ sessionId, userId, now = new Date() }) {
  return prisma.$transaction(async (tx) => {
    await lockSession(tx, sessionId);
    const { count } = await tx.sessionParticipant.deleteMany({ where: { sessionId, studentId: userId } });
    if (count === 0) return false;
    await tx.sessionInvitation.updateMany({
      where: { sessionId, acceptedById: userId, status: 'Accepted' },
      data: { status: 'Declined', respondedAt: now },
    });
    // The placeholders asking this guest and the tutor to rate each other.
    await tx.review.deleteMany({ where: { sessionId, studentId: userId, rating: null } });
    await tx.studentReview.deleteMany({ where: { sessionId, studentId: userId, status: 'pending' } });
    return true;
  });
}
