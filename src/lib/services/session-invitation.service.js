/**
 * Group session invitations.
 *
 * Whoever books a group session pays for every seat (`Session.maxCapacity`)
 * and invites the others by email. A guest takes a seat by accepting:
 *   - with the link of the email — a single-use secret token (only its
 *     SHA-256 is stored). Whoever holds it and is logged in can use it, even
 *     with an account under another address (many students are invited at
 *     their university email and registered with a personal one);
 *   - or from their own account (`/invitacion/<invitation id>`), when the
 *     invitation was sent to one of their addresses. The in-app notification
 *     links there, so no token is ever stored in clear.
 *
 * Accepting adds the guest to the session and to its Google Calendar event
 * (so they get the Meet), and emails them the confirmation. Guests never pay,
 * never see what was paid and cannot cancel the session — they can only leave
 * it, which frees the seat for the organiser to invite someone else.
 *
 * Races (last seat, link used twice, same guest invited twice) are settled in
 * session-invitation.repository under a lock on the session row.
 */

import crypto from 'crypto';
import * as Sentry from '@sentry/nextjs';
import { waitUntil } from '@vercel/functions';
import * as invitationRepo from '../repositories/session-invitation.repository';
import * as sessionRepo from '../repositories/session.repository';
import * as reviewRepo from '../repositories/review.repository';
import * as userRepo from '../repositories/user.repository';
import * as emailService from './email.service';
import * as notificationService from './notification.service';
import * as calicoCalendar from './calico-calendar.service';
import { sessionConfirmedEmailParams } from './session.service';
import {
  INVITATION_MAX_SENDS,
  INVITATION_RESEND_COOLDOWN_MINUTES,
  cleanInviteEmails,
  isGroupSession,
  organizerIdOf,
} from '../sessions/group-session';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE_STATUSES = ['Pending', 'Accepted'];

/** Codes the routes answer as-is (4xx); anything else is a 500. */
export const INVITATION_ERROR_STATUS = Object.freeze({
  NOT_FOUND: 404,
  AUTH_REQUIRED: 401,
  FORBIDDEN: 403,
  NOT_GROUP: 409,
  SESSION_NOT_ACTIVE: 409,
  SESSION_STARTED: 409,
  SESSION_FULL: 409,
  INVITATION_NOT_PENDING: 409,
  ALREADY_JOINED: 409,
  SELF_BOOKING: 409,
  ALREADY_INVITED: 409,
  NO_SEATS_LEFT: 409,
  INVITATION_LIMIT: 409,
  RESEND_LIMIT: 429,
  RESEND_TOO_SOON: 429,
  ORGANIZER_CANNOT_LEAVE: 409,
  INVITE_INVALID_EMAIL: 400,
  INVITE_SELF: 400,
  INVITE_DUPLICATE: 400,
  INVITE_TOO_MANY: 400,
});

export function isInvitationError(err) {
  return Boolean(err?.code) && Object.prototype.hasOwnProperty.call(INVITATION_ERROR_STATUS, err.code);
}

function fail(code, message = code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// ─── Tokens & links ──────────────────────────────────────────────────────

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function invitationLink(key) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/invitacion/${encodeURIComponent(key)}`;
}

function firstName(name) {
  return String(name ?? '').trim().split(/\s+/)[0] || '';
}

function keepAlive(promise) {
  waitUntil(Promise.resolve(promise).catch(() => {}));
}

// ─── Guards ──────────────────────────────────────────────────────────────

async function loadSession(sessionId) {
  const session = await sessionRepo.findById(sessionId);
  if (!session) throw fail('NOT_FOUND', 'Session not found');
  return session;
}

/** The session, only for the student who booked it and only while it is a group session. */
async function loadAsOrganizer(sessionId, userId) {
  const session = await loadSession(sessionId);
  if (organizerIdOf(session) !== userId) throw fail('FORBIDDEN', 'Solo quien agendó la tutoría puede gestionar sus invitaciones');
  if (!isGroupSession(session)) throw fail('NOT_GROUP', 'La tutoría no es grupal');
  return session;
}

function assertOpenForGuests(session, now = new Date()) {
  if (!ACTIVE_STATUSES.includes(session.status)) throw fail('SESSION_NOT_ACTIVE', 'La tutoría ya no está activa');
  if (new Date(session.startTimestamp).getTime() <= now.getTime()) throw fail('SESSION_STARTED', 'La tutoría ya empezó');
}

/**
 * Find an invitation by the key of its link: the secret token of the email,
 * or its id — and then only for the account it was addressed to (anyone else
 * gets NOT_FOUND, never a hint that it exists).
 */
async function resolveInvitation(key, userId) {
  const raw = String(key ?? '').trim();
  if (!raw || raw.length > 200) throw fail('NOT_FOUND', 'Invitation not found');

  if (UUID_PATTERN.test(raw)) {
    if (!userId) throw fail('AUTH_REQUIRED', 'Inicia sesión para ver esta invitación');
    const invitation = await invitationRepo.findById(raw);
    if (!invitation) throw fail('NOT_FOUND', 'Invitation not found');
    if (invitation.acceptedById === userId) return invitation;
    const emails = await invitationRepo.findUserEmails(userId);
    if (!emails.includes(invitation.email)) throw fail('NOT_FOUND', 'Invitation not found');
    return invitation;
  }

  const invitation = await invitationRepo.findByTokenHash(hashToken(raw));
  if (!invitation) throw fail('NOT_FOUND', 'Invitation not found');
  return invitation;
}

// ─── Sending ─────────────────────────────────────────────────────────────

/**
 * Email one invitation (and ping the account behind that address, if any).
 * Resolves to whether the email went out; never throws — an invitation whose
 * email failed stays pending with `sentCount` 0 and can be re-sent.
 */
async function deliver({ invitation, token, session, inviterName, accounts = [] }) {
  const times = sessionConfirmedEmailParams(session, session.tutor, null);
  let sent = false;
  try {
    await emailService.sendSessionInvitationEmail(invitation.email, {
      inviterName,
      courseName: times.courseName,
      tutorName: times.tutorName,
      startTime: times.startTime,
      endTime: times.endTime,
      invitationLink: invitationLink(token),
    });
    await invitationRepo.markSent(invitation.id);
    sent = true;
  } catch (err) {
    console.error(`[invitations] Email for invitation ${invitation.id} failed: ${err.message}`);
    Sentry.captureException(err, {
      level: 'warning',
      tags: { domain: 'sessions', service: 'session-invitation', operation: 'send-email' },
      extra: { invitationId: invitation.id, sessionId: session.id },
    });
  }

  const account = accounts.find((a) =>
    [a.email, a.universityEmail].some((e) => e && e.toLowerCase() === invitation.email));
  if (account) {
    await notificationService.notifySessionInvitation(account.id, {
      session, inviterName, invitationId: invitation.id,
    });
  }
  return sent;
}

/**
 * Write the invitations and send them. `background` (the checkout) returns as
 * soon as the rows exist; otherwise the emails are awaited so the caller can
 * tell the organiser whether each one went out.
 */
async function invite({ session, organizerId, emails, background = false }) {
  const tokens = new Map(emails.map((email) => [email, newToken()]));
  const { created, skipped } = await invitationRepo.inviteMany({
    sessionId: session.id,
    invitedById: organizerId,
    invites: emails.map((email) => ({ email, tokenHash: hashToken(tokens.get(email)) })),
  });
  if (created.length === 0) return { created, skipped, sent: [] };

  const [organizer, accounts] = await Promise.all([
    userRepo.findById(organizerId),
    invitationRepo.findAccountsByEmails(created.map((row) => row.email)),
  ]);
  const inviterName = firstName(organizer?.name) || 'Un estudiante';

  const sending = Promise.all(created.map((invitation) =>
    deliver({ invitation, token: tokens.get(invitation.email), session, inviterName, accounts })));
  if (background) {
    keepAlive(sending);
    return { created, skipped, sent: [] };
  }
  return { created, skipped, sent: await sending };
}

// ─── Organiser ───────────────────────────────────────────────────────────

/** Checkout: invite the guests typed while booking. Emails go out in the background. */
export async function inviteAfterBooking({ session, organizerId, emails }) {
  if (!isGroupSession(session) || !emails?.length) return { created: [], skipped: [] };
  return invite({ session, organizerId, emails, background: true });
}

/**
 * The organiser invites one more guest (a free seat, or one a guest declined
 * or left). Never the organiser, the tutor or someone already in the session.
 *
 * @returns {Promise<{ invitation: object, emailSent: boolean }>}
 */
export async function inviteGuest({ sessionId, userId, email }) {
  const session = await loadAsOrganizer(sessionId, userId);
  assertOpenForGuests(session);

  const ownEmails = await invitationRepo.findUserEmails(userId);
  const tutorEmails = await invitationRepo.findUserEmails(session.tutorId);
  const cleaned = cleanInviteEmails([email], { maxGuests: 1, exclude: [...ownEmails, ...tutorEmails] });
  if (cleaned.error) throw fail(cleaned.error);
  const [address] = cleaned.emails;
  if (!address) throw fail('INVITE_INVALID_EMAIL');

  // Someone already in the session, under any of their addresses.
  const guests = session.participants.map((p) => p.studentId).filter((id) => id !== userId);
  const taken = (await Promise.all(guests.map((id) => invitationRepo.findUserEmails(id)))).flat();
  if (taken.includes(address)) throw fail('ALREADY_INVITED', 'Esa persona ya está en la tutoría');

  const { created, skipped, sent } = await invite({ session, organizerId: userId, emails: [address] });
  if (created.length === 0) throw fail(skipped[0]?.reason || 'NO_SEATS_LEFT');
  return { invitation: created[0], emailSent: Boolean(sent[0]) };
}

/**
 * Seats and invitations of a group session.
 *  - The organiser gets every invitation (address, state, who took it).
 *  - The tutor and the guests only get the counts: the addresses are the
 *    organiser's contacts.
 */
export async function listForSession({ sessionId, userId }) {
  const session = await loadSession(sessionId);
  const isOrganizer = organizerIdOf(session) === userId;
  const isMember = session.tutorId === userId || session.participants.some((p) => p.studentId === userId);
  if (!isMember) throw fail('FORBIDDEN', 'Forbidden');
  if (!isGroupSession(session)) throw fail('NOT_GROUP', 'La tutoría no es grupal');

  const invitations = await invitationRepo.findBySession(sessionId);
  const pending = invitations.filter((i) => i.status === 'Pending').length;
  const taken = session.participants.length;
  const open = ACTIVE_STATUSES.includes(session.status) && new Date(session.startTimestamp) > new Date();
  return {
    seats: { total: session.maxCapacity, taken, pending, free: Math.max(0, session.maxCapacity - taken - pending) },
    canManage: isOrganizer && open,
    invitations: isOrganizer
      ? invitations.map((i) => ({
          id: i.id,
          email: i.email,
          status: i.status,
          emailSent: i.sentCount > 0,
          canResend: i.status === 'Pending' && i.sentCount < INVITATION_MAX_SENDS,
          acceptedByName: i.acceptedBy?.name ?? null,
          createdAt: i.createdAt,
        }))
      : [],
  };
}

async function loadOwnPendingInvitation({ sessionId, invitationId, userId }) {
  const session = await loadAsOrganizer(sessionId, userId);
  const invitation = await invitationRepo.findById(invitationId);
  if (!invitation || invitation.sessionId !== session.id) throw fail('NOT_FOUND', 'Invitation not found');
  if (invitation.status !== 'Pending') throw fail('INVITATION_NOT_PENDING', 'La invitación ya fue respondida');
  return { session, invitation };
}

/** Send a pending invitation again with a NEW link (the old one stops working). */
export async function resend({ sessionId, invitationId, userId, now = new Date() }) {
  const { session, invitation } = await loadOwnPendingInvitation({ sessionId, invitationId, userId });
  assertOpenForGuests(session, now);
  if (invitation.sentCount >= INVITATION_MAX_SENDS) throw fail('RESEND_LIMIT', 'Ya reenviaste esta invitación varias veces');
  const cooldownMs = INVITATION_RESEND_COOLDOWN_MINUTES * 60_000;
  if (invitation.lastSentAt && now.getTime() - new Date(invitation.lastSentAt).getTime() < cooldownMs) {
    throw fail('RESEND_TOO_SOON', `Espera ${INVITATION_RESEND_COOLDOWN_MINUTES} minutos antes de reenviar`);
  }

  const token = newToken();
  // Rotate first: if the email then fails, the old link is dead either way and
  // the organiser sees "no enviado" and can try again.
  await invitationRepo.markSent(invitation.id, { tokenHash: hashToken(token) }, now);
  const organizer = await userRepo.findById(userId);
  const times = sessionConfirmedEmailParams(session, session.tutor, null);
  await emailService.sendSessionInvitationEmail(invitation.email, {
    inviterName: firstName(organizer?.name) || 'Un estudiante',
    courseName: times.courseName,
    tutorName: times.tutorName,
    startTime: times.startTime,
    endTime: times.endTime,
    invitationLink: invitationLink(token),
  });
  return { success: true };
}

/** The organiser withdraws a pending invitation: its link dies and the seat is free again. */
export async function revoke({ sessionId, invitationId, userId }) {
  const { invitation } = await loadOwnPendingInvitation({ sessionId, invitationId, userId });
  const closed = await invitationRepo.closePending(invitation.id, 'Revoked');
  if (!closed) throw fail('INVITATION_NOT_PENDING', 'La invitación ya fue respondida');
  return { success: true };
}

// ─── Guest ───────────────────────────────────────────────────────────────

/**
 * What an invitation link shows before accepting. Readable without logging in
 * (with the token), so it carries the minimum: who invites (first name), the
 * course, the tutor's name and the time. No emails, no price, no Meet link.
 */
export async function preview({ key, userId = null, now = new Date() }) {
  const invitation = await resolveInvitation(key, userId);
  const { session } = invitation;

  const sessionOpen = ACTIVE_STATUSES.includes(session.status) && new Date(session.startTimestamp) > now;
  let state = 'open';
  if (invitation.status === 'Accepted') state = 'accepted';
  else if (invitation.status !== 'Pending') state = 'closed';
  else if (!sessionOpen) state = 'expired';
  else if (session._count.participants >= session.maxCapacity) state = 'full';

  let viewer = { isTutor: false, alreadyJoined: false, acceptedByMe: false };
  if (userId) {
    viewer = {
      isTutor: session.tutorId === userId,
      alreadyJoined: await sessionRepo.isStudentInSession(session.id, userId),
      acceptedByMe: invitation.acceptedById === userId,
    };
  }

  return {
    id: invitation.id,
    state,
    inviterName: firstName(invitation.invitedBy?.name) || null,
    course: session.course,
    tutor: { name: session.tutor?.name ?? null, profilePictureUrl: session.tutor?.profilePictureUrl ?? null },
    startTimestamp: session.startTimestamp,
    endTimestamp: session.endTimestamp,
    seats: { total: session.maxCapacity, taken: session._count.participants },
    viewer,
  };
}

/**
 * Accept an invitation: the user joins the session, gets the calendar event
 * (and its Meet) and the confirmation email.
 *
 * @returns {Promise<{ session: object, alreadyJoined: boolean }>}
 */
export async function accept({ key, userId }) {
  if (!userId) throw fail('AUTH_REQUIRED', 'Inicia sesión para aceptar la invitación');
  const invitation = await resolveInvitation(key, userId);

  const { outcome } = await invitationRepo.accept({ invitationId: invitation.id, userId });
  const session = await sessionRepo.findById(invitation.sessionId);
  if (outcome === 'already-joined') return { session, alreadyJoined: true };

  const guest = session.participants.find((p) => p.studentId === userId)?.student;

  // Placeholder so the guest can rate the tutor afterwards (createSession
  // writes the organiser's the same way). completeSession re-creates it if missing.
  try {
    await reviewRepo.upsertReview({
      sessionId: session.id,
      studentId: userId,
      tutorId: session.tutorId,
      courseId: session.courseId,
      rating: null,
      status: 'pending',
      comment: null,
    });
  } catch (err) {
    console.warn(`[invitations] Pending review for guest failed: ${err.message}`);
  }

  // Calendar: Google emails the guest the event with the Meet. Awaited so a
  // failure is known here; the guest is in the session either way and still
  // gets the Meet link in the confirmation email and in their history.
  if (session.googleCalendarEventId && guest?.email) {
    try {
      await calicoCalendar.updateTutoringSessionAttendees(session.googleCalendarEventId, {
        add: { email: guest.email, name: guest.name },
      });
    } catch (err) {
      console.warn(`[invitations] Could not add guest to calendar event of session ${session.id}: ${err.message}`);
    }
  }

  if (guest?.email) {
    const params = sessionConfirmedEmailParams(session, session.tutor, guest);
    keepAlive(
      emailService
        .sendSessionConfirmedEmail(guest.email, { recipientName: guest.name || '', ...params })
        .catch((err) => console.error(`[invitations] Confirmation email to guest failed: ${err.message}`)),
    );
  }
  const guestName = guest?.name || 'Un estudiante';
  keepAlive(notificationService.notifyStudentJoinedGroup(session, guestName));
  keepAlive(notificationService.notifyInvitationAnswered(invitation.invitedById, { session, guestName, accepted: true }));

  return { session, alreadyJoined: false };
}

/** Decline a pending invitation. The link is enough: no account needed to say no. */
export async function decline({ key, userId = null }) {
  const invitation = await resolveInvitation(key, userId);
  const closed = await invitationRepo.closePending(invitation.id, 'Declined');
  if (!closed) throw fail('INVITATION_NOT_PENDING', 'La invitación ya fue respondida');

  const session = await sessionRepo.findById(invitation.sessionId);
  if (session) {
    keepAlive(notificationService.notifyInvitationAnswered(invitation.invitedById, {
      session, guestName: invitation.email, accepted: false,
    }));
  }
  return { success: true };
}

/** Pending invitations addressed to the user's own emails, for sessions still to come. */
export async function listMine(userId, now = new Date()) {
  const emails = await invitationRepo.findUserEmails(userId);
  const invitations = await invitationRepo.findPendingByEmails(emails, now);
  return invitations
    // Not the ones to a session they already joined (with another link) or teach.
    .filter((i) => i.session.tutorId !== userId)
    .map((i) => ({
      id: i.id,
      inviterName: firstName(i.invitedBy?.name) || null,
      course: i.session.course,
      tutor: { name: i.session.tutor?.name ?? null },
      startTimestamp: i.session.startTimestamp,
      endTimestamp: i.session.endTimestamp,
      full: i.session._count.participants >= i.session.maxCapacity,
    }));
}

/**
 * A guest leaves a group session before it starts. The seat is free again;
 * nothing is refunded (the guest paid nothing) and the session goes on.
 * Whoever booked cannot leave — they cancel the session instead.
 */
export async function leaveSession({ sessionId, userId }) {
  const session = await loadSession(sessionId);
  const me = session.participants.find((p) => p.studentId === userId);
  if (!me) throw fail('FORBIDDEN', 'No estás en esta tutoría');
  if (!isGroupSession(session)) throw fail('NOT_GROUP', 'La tutoría no es grupal');
  const organizerId = organizerIdOf(session);
  if (organizerId === userId) throw fail('ORGANIZER_CANNOT_LEAVE', 'Quien agendó la tutoría debe cancelarla');
  assertOpenForGuests(session);

  const left = await invitationRepo.leave({ sessionId, userId });
  if (!left) throw fail('FORBIDDEN', 'No estás en esta tutoría');

  if (session.googleCalendarEventId && me.student?.email) {
    try {
      await calicoCalendar.updateTutoringSessionAttendees(session.googleCalendarEventId, {
        removeEmail: me.student.email,
      });
    } catch (err) {
      console.warn(`[invitations] Could not remove guest from calendar event of session ${session.id}: ${err.message}`);
    }
  }
  keepAlive(notificationService.notifyGuestLeftGroup(session, {
    guestName: me.student?.name || 'Un estudiante', organizerId,
  }));
  return { success: true };
}
