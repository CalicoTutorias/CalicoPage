/**
 * Event Survey Repository
 * Post-event survey responses and the event-side reviews they create, the
 * pending-feedback reads for the home popup, and the reads/writes behind the
 * admin event and survey reminders. Business rules live in
 * event-survey.service.js.
 *
 * Models: EventSurveyResponse, Review (event side of the session/event arc),
 *         EventRegistration (surveyRemindedAt), Event (lastReminderAt)
 */

import prisma from '../prisma';

/**
 * Event reviews are created only here (review.repository.upsertReview
 * refuses calls without a sessionId).
 */
export async function createResponseWithReviews(tx, { registrationId, attended, eventRating, reviews }) {
  // Response first: its unique registrationId makes a second (concurrent)
  // submission abort the whole transaction before any review is written.
  const response = await tx.eventSurveyResponse.create({
    data: { registrationId, attended, eventRating: attended ? eventRating : null },
  });
  if (reviews.length) await tx.review.createMany({ data: reviews });
  return response;
}

/** The user's most recently ended event with a Confirmed, unanswered registration. */
export async function findPendingEventSurvey(userId, now) {
  return prisma.eventRegistration.findFirst({
    where: {
      userId,
      status: 'Confirmed',
      surveyResponse: { is: null },
      event: { endsAt: { lt: now }, status: { not: 'Canceled' } },
    },
    orderBy: { event: { endsAt: 'desc' } },
    select: {
      event: {
        select: {
          id: true, slug: true, title: true, endsAt: true,
          tutors: { orderBy: { position: 'asc' }, select: { tutor: { select: { id: true, name: true, profilePictureUrl: true } } } },
        },
      },
    },
  });
}

/** Unrated session reviews of past, live sessions (the TutoringHistory canRate rule), latest first. */
export async function findPendingSessionReview(userId, now) {
  return prisma.review.findMany({
    where: {
      studentId: userId, status: 'pending', rating: null, sessionId: { not: null },
      session: { endTimestamp: { lt: now }, status: { notIn: ['Canceled', 'Rejected'] } },
    },
    orderBy: { session: { endTimestamp: 'desc' } },
    take: 5,
    select: {
      id: true, tutorId: true,
      session: {
        select: {
          id: true, tutorId: true, startTimestamp: true, endTimestamp: true,
          course: { select: { name: true, code: true } },
          tutor: { select: { name: true } },
        },
      },
    },
  });
}

const RECIPIENT_SELECT = { id: true, name: true, email: true };

/** Recipients of the event reminder: every Confirmed registration. */
export async function findConfirmedRegistrants(eventId) {
  return prisma.eventRegistration.findMany({
    where: { eventId, status: 'Confirmed' },
    select: { id: true, user: { select: RECIPIENT_SELECT } },
  });
}

/**
 * Stamp lastReminderAt = now only if it still holds the value the caller
 * read (compare-and-set), so two concurrent clicks cannot both send.
 * @returns {Promise<boolean>} false when another request claimed it first
 */
export async function claimEventReminder(eventId, previousReminderAt, now) {
  const { count } = await prisma.event.updateMany({
    where: { id: eventId, lastReminderAt: previousReminderAt },
    data: { lastReminderAt: now },
  });
  return count === 1;
}

/**
 * Confirmed registrations of the event split in two:
 *   - targets: no survey response, and never reminded or reminded before now − cooldownMs;
 *   - excluded: the other Confirmed ones (answered, or reminded within the cooldown).
 * Rows: { id, surveyRemindedAt, answered, user: { id, name, email } }
 */
export async function findSurveyReminderTargets(eventId, now, cooldownMs) {
  const cutoff = new Date(now.getTime() - cooldownMs);
  const select = {
    id: true,
    surveyRemindedAt: true,
    surveyResponse: { select: { id: true } },
    user: { select: RECIPIENT_SELECT },
  };
  const [targets, excluded] = await Promise.all([
    prisma.eventRegistration.findMany({
      where: {
        eventId,
        status: 'Confirmed',
        surveyResponse: { is: null },
        OR: [{ surveyRemindedAt: null }, { surveyRemindedAt: { lt: cutoff } }],
      },
      select,
    }),
    prisma.eventRegistration.findMany({
      where: {
        eventId,
        status: 'Confirmed',
        OR: [{ surveyResponse: { isNot: null } }, { surveyRemindedAt: { gte: cutoff } }],
      },
      select,
    }),
  ]);
  const toRow = ({ surveyResponse, ...row }) => ({ ...row, answered: Boolean(surveyResponse) });
  return { targets: targets.map(toRow), excluded: excluded.map(toRow) };
}

export async function markSurveyReminded(registrationIds, now) {
  return prisma.eventRegistration.updateMany({
    where: { id: { in: registrationIds } },
    data: { surveyRemindedAt: now },
  });
}
