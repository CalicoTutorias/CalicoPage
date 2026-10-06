/**
 * Event Survey Service
 * Post-event survey (spec §6.1), the pending-feedback item for the home popup
 * (§6.2) and the admin "remind event" / "remind survey" actions (§7).
 *
 * Survey: one transaction, under the event row lock, creates the
 * EventSurveyResponse and one done Review per tutor (event side of the
 * session/event arc). The response is created first, so a second submission
 * fails on its unique registrationId (P2002 → SURVEY_ALREADY_SUBMITTED)
 * before any review is written. After the commit the tutors' public rating
 * is recomputed and each tutor is notified.
 *
 * Reminders follow admin.service.sendAvailabilityReminders: the template is
 * checked before any recipient is loaded, each send is independent
 * (Promise.allSettled) and the action is audited.
 */

import prisma from '../prisma';
import * as eventRepo from '../repositories/event.repository';
import * as eventRegRepo from '../repositories/event-registration.repository';
import * as surveyRepo from '../repositories/event-survey.repository';
import * as reviewRepo from '../repositories/review.repository';
import * as userRepo from '../repositories/user.repository';
import * as notificationService from './notification.service';
import * as auditService from './admin-audit.service';
import { sendEventReminderTo, sendSurveyReminderTo } from './event-email.service';
import { EVENT_EMAIL, isEventEmailConfigured } from './email.service';
import { EVENT_TX_OPTIONS } from '../events/event-rules';

const { ADMIN_ACTIONS } = auditService;

export const SURVEY_ERROR = Object.freeze({
  NOT_AVAILABLE: 'SURVEY_NOT_AVAILABLE',
  ALREADY_SUBMITTED: 'SURVEY_ALREADY_SUBMITTED',
  INVALID: 'INVALID_SURVEY',
});

export const EVENT_REMINDER_COOLDOWN_MS = 60 * 60 * 1000;
export const SURVEY_REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const COMMENT_MAX = 1000;

function domainError(code, message = code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// ─── Survey ──────────────────────────────────────────────────────────────

const isRating = (v) => Number.isInteger(v) && v >= 1 && v <= 5;

/**
 * Reviews for an attended survey. `tutorRatings` must cover exactly the
 * event's tutors other than the respondent (no missing, extra or repeated
 * ids), every rating 1–5 and every comment at most 1000 characters. Throws
 * INVALID_SURVEY.
 */
function buildReviews(event, userId, { eventRating, tutorRatings }) {
  const invalid = () => domainError(SURVEY_ERROR.INVALID);
  if (!isRating(eventRating) || !Array.isArray(tutorRatings)) throw invalid();

  // Never a self-review: a tutor added to the event after registering is not
  // asked to rate themselves (registration already refuses EVENT_TUTOR).
  const expected = new Set(event.tutors.map((t) => t.tutor.id).filter((id) => id !== userId));
  const given = new Set(tutorRatings.map((r) => r?.tutorId));
  if (
    given.size !== tutorRatings.length ||
    given.size !== expected.size ||
    [...given].some((id) => !expected.has(id))
  ) {
    throw invalid();
  }

  return tutorRatings.map(({ tutorId, rating, comment }) => {
    if (!isRating(rating)) throw invalid();
    if (comment != null && typeof comment !== 'string') throw invalid();
    const text = (comment ?? '').trim();
    if (text.length > COMMENT_MAX) throw invalid();
    return {
      eventId: event.id,
      tutorId,
      studentId: userId,
      courseId: event.courseId ?? null,
      rating,
      comment: text || null,
      status: 'done',
    };
  });
}

/** Recompute each tutor's public rating and notify them. Post-commit: failures are logged only. */
async function afterReviews(reviews, userId) {
  const stats = await Promise.allSettled(reviews.map((r) => reviewRepo.updateTutorReviewStats(r.tutorId)));
  stats.forEach((res, i) => {
    if (res.status === 'rejected') {
      console.error(`[event-survey] Rating update failed for tutor ${reviews[i].tutorId}:`, res.reason?.message);
    }
  });

  const student = await userRepo.findById(userId).catch(() => null);
  const studentName = student?.name || 'Un estudiante';
  await Promise.all(reviews.map((r) => notificationService.notifyReviewReceived(r.tutorId, studentName, r.rating, null)));
}

/**
 * Submit the post-event survey (spec §6.1).
 * @returns {Promise<{ responseId: string, reviewsCreated: number }>}
 * @throws EVENT_NOT_FOUND | INVALID_SURVEY | SURVEY_NOT_AVAILABLE | SURVEY_ALREADY_SUBMITTED
 */
export async function submitSurvey({ slug, userId, attended, eventRating, tutorRatings, now = new Date() }) {
  const event = await eventRepo.findBySlug(slug);
  if (!event || event.status === 'Draft') throw domainError('EVENT_NOT_FOUND');
  if (typeof attended !== 'boolean') throw domainError(SURVEY_ERROR.INVALID);

  const reviews = attended ? buildReviews(event, userId, { eventRating, tutorRatings }) : [];

  let response;
  try {
    response = await prisma.$transaction(async (tx) => {
      const locked = await eventRegRepo.lockEvent(tx, event.id);
      if (!locked || locked.status !== 'Published' || now < new Date(locked.ends_at)) {
        throw domainError(SURVEY_ERROR.NOT_AVAILABLE);
      }
      const registration = await eventRegRepo.findRegistration(tx, event.id, userId);
      if (registration?.status !== 'Confirmed') throw domainError(SURVEY_ERROR.NOT_AVAILABLE);

      return surveyRepo.createResponseWithReviews(tx, {
        registrationId: registration.id,
        attended,
        eventRating: attended ? eventRating : null,
        reviews,
      });
    }, EVENT_TX_OPTIONS);
  } catch (err) {
    // Prisma 7 + pg adapter: no meta.target. The response is created first, so
    // its unique registrationId is the constraint that fires.
    if (err?.code === 'P2002') throw domainError(SURVEY_ERROR.ALREADY_SUBMITTED);
    throw err;
  }

  if (reviews.length) await afterReviews(reviews, userId);
  return { responseId: response.id, reviewsCreated: reviews.length };
}

// ─── Pending feedback ────────────────────────────────────────────────────

/**
 * The one item the home popup should show (spec §6.2): the most recently
 * ended unanswered event survey, else the latest unrated session review.
 * @returns {Promise<null | { type: 'event_survey', event } | { type: 'session_review', session }>}
 */
export async function getPendingFeedback(userId, now = new Date()) {
  const registration = await surveyRepo.findPendingEventSurvey(userId, now);
  if (registration?.event) {
    const { id, slug, title, endsAt, tutors } = registration.event;
    return { type: 'event_survey', event: { id, slug, title, endsAt, tutors: tutors.map((t) => t.tutor) } };
  }

  const rows = await surveyRepo.findPendingSessionReview(userId, now);
  // A placeholder for a tutor other than the session's cannot be submitted.
  const review = rows.find((r) => r.session && r.tutorId === r.session.tutorId);
  if (!review) return null;

  const s = review.session;
  return {
    type: 'session_review',
    session: {
      id: s.id,
      tutorId: s.tutorId,
      tutorName: s.tutor?.name ?? null,
      course: s.course ? { name: s.course.name, code: s.course.code } : null,
      scheduledDateTime: s.startTimestamp,
      startTimestamp: s.startTimestamp,
      endTimestamp: s.endTimestamp,
      pendingReview: { id: review.id, status: 'pending', rating: null },
    },
  };
}

// ─── Admin reminders ─────────────────────────────────────────────────────

async function loadEvent(id) {
  const event = await eventRepo.findById(id);
  if (!event) throw domainError('NOT_FOUND', 'Evento no encontrado');
  return event;
}

function assertTemplate(key) {
  if (!isEventEmailConfigured(key)) {
    throw domainError(
      'EMAIL_TEMPLATE_NOT_CONFIGURED',
      `La plantilla de Brevo ${key} no está configurada todavía (TEMPLATE_IDS.${key} en email.service.js).`,
    );
  }
}

/** Send to every row independently. @returns {{ sent, failed, sentRows }} */
async function sendToAll(rows, send, tag) {
  const results = await Promise.allSettled(rows.map((row) => send(row.user)));
  const sent = [];
  const failed = [];
  const sentRows = [];
  results.forEach((result, i) => {
    const { user } = rows[i];
    if (result.status === 'fulfilled') {
      sent.push({ userId: user.id, email: user.email });
      sentRows.push(rows[i]);
    } else {
      console.error(`[event-survey.${tag}] ${user.email}:`, result.reason?.message || result.reason);
      failed.push({ userId: user.id, email: user.email, reason: 'SEND_FAILED' });
    }
  });
  return { sent, failed, sentRows };
}

/**
 * Email the event reminder to every Confirmed registrant (spec §7). Refused
 * while the previous reminder is under 1 h old (double clicks); the cooldown
 * is claimed with a compare-and-set before anything is sent.
 * @returns {Promise<{ sent: object[], failed: object[] }>}
 * @throws NOT_FOUND | INVALID_STATE | EMAIL_TEMPLATE_NOT_CONFIGURED | REMINDER_COOLDOWN
 */
export async function sendEventReminder({ eventId, adminId, request, now = new Date() }) {
  const event = await loadEvent(eventId);
  if (event.status !== 'Published' || now >= new Date(event.endsAt)) {
    throw domainError('INVALID_STATE', 'Solo se puede recordar un evento publicado que no ha terminado');
  }
  assertTemplate(EVENT_EMAIL.REMINDER);

  const last = event.lastReminderAt ? new Date(event.lastReminderAt) : null;
  const cooldown = () => domainError('REMINDER_COOLDOWN', 'Ya se envió un recordatorio de este evento hace menos de 1 hora');
  if (last && now.getTime() - last.getTime() < EVENT_REMINDER_COOLDOWN_MS) throw cooldown();
  if (!(await surveyRepo.claimEventReminder(eventId, event.lastReminderAt ?? null, now))) throw cooldown();

  const registrants = await surveyRepo.findConfirmedRegistrants(eventId);
  const { sent, failed } = await sendToAll(registrants, (user) => sendEventReminderTo({ event, user }), 'sendEventReminder');

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.EVENT_REMINDER,
    targetType: 'Event',
    targetId: eventId,
    payload: { slug: event.slug, sentUserIds: sent.map((s) => s.userId), failedUserIds: failed.map((f) => f.userId) },
    request,
  });

  return { sent, failed };
}

/**
 * Email the survey reminder (spec §7) to Confirmed registrants of an ended
 * event who have not answered and were not reminded in the last 24 h.
 * surveyRemindedAt is stamped only for successful sends.
 * @returns {Promise<{ sent: object[], failed: object[], skipped: object[] }>}
 *          skipped: { userId, email, reason: 'ANSWERED' | 'RECENTLY_REMINDED', lastRemindedAt? }
 * @throws NOT_FOUND | INVALID_STATE | EMAIL_TEMPLATE_NOT_CONFIGURED
 */
export async function sendSurveyReminders({ eventId, adminId, request, now = new Date() }) {
  const event = await loadEvent(eventId);
  if (event.status !== 'Published' || now < new Date(event.endsAt)) {
    throw domainError('INVALID_STATE', 'La encuesta solo se puede recordar cuando el evento publicado ya terminó');
  }
  assertTemplate(EVENT_EMAIL.SURVEY_REMINDER);

  const { targets, excluded } = await surveyRepo.findSurveyReminderTargets(eventId, now, SURVEY_REMINDER_COOLDOWN_MS);
  const skipped = excluded.map((r) => (r.answered
    ? { userId: r.user.id, email: r.user.email, reason: 'ANSWERED' }
    : { userId: r.user.id, email: r.user.email, reason: 'RECENTLY_REMINDED', lastRemindedAt: r.surveyRemindedAt }));

  const { sent, failed, sentRows } = await sendToAll(
    targets,
    (user) => sendSurveyReminderTo({ event, user }),
    'sendSurveyReminders',
  );
  if (sentRows.length) await surveyRepo.markSurveyReminded(sentRows.map((r) => r.id), now);

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.EVENT_SURVEY_REMINDER,
    targetType: 'Event',
    targetId: eventId,
    payload: {
      slug: event.slug,
      sentUserIds: sent.map((s) => s.userId),
      failedUserIds: failed.map((f) => f.userId),
      skippedCount: skipped.length,
    },
    request,
  });

  return { sent, failed, skipped };
}
