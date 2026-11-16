/**
 * Event Repository
 * Prisma wrappers for Event + EventTutor (+ the user lookups the admin flows
 * need). Business rules live in event-admin.service.js.
 *
 * Models: Event, EventTutor
 */

import prisma from '../prisma';
import { COUNTED_EVENT_WHERE } from './metrics-exclusions';

/** Tutors in display order + the optional course. Every Event read uses it. */
export const EVENT_INCLUDE = {
  tutors: {
    orderBy: { position: 'asc' },
    include: { tutor: { select: { id: true, name: true, email: true, profilePictureUrl: true } } },
  },
  course: { select: { id: true, name: true, code: true } },
};

const ADMIN_FILTERS = {
  all: () => ({}),
  draft: () => ({ status: 'Draft' }),
  published: (now) => ({ status: 'Published', endsAt: { gte: now } }),
  finished: (now) => ({ status: 'Published', endsAt: { lt: now } }),
  canceled: () => ({ status: 'Canceled' }),
};

const EMPTY_STATS = Object.freeze({ confirmed: 0, pending: 0, awaitingApproval: 0, rejected: 0, canceled: 0, responses: 0 });

const tutorRows = (tutorIds) => tutorIds.map((tutorId, position) => ({ tutorId, position }));

/** Create the event and its tutors (position = index in `tutorIds`). */
export async function create({ data, tutorIds }) {
  return prisma.event.create({
    data: { ...data, tutors: { create: tutorRows(tutorIds) } },
    include: EVENT_INCLUDE,
  });
}

/** Update scalars; when `tutorIds` is given, replace the tutor list in the same transaction. */
export async function update(id, data, tutorIds) {
  return prisma.$transaction(async (tx) => {
    if (tutorIds) {
      await tx.eventTutor.deleteMany({ where: { eventId: id } });
      await tx.eventTutor.createMany({
        data: tutorRows(tutorIds).map((row) => ({ ...row, eventId: id })),
      });
    }
    return tx.event.update({ where: { id }, data, include: EVENT_INCLUDE });
  });
}

/**
 * Update only while the event is still in `expectedStatus`, so concurrent
 * transitions (e.g. two publish clicks) cannot both win.
 * @returns the updated event, or null when its status had already changed
 */
export async function updateIfStatus(id, expectedStatus, data) {
  const { count } = await prisma.event.updateMany({ where: { id, status: expectedStatus }, data });
  return count === 0 ? null : findById(id);
}

export async function findById(id) {
  if (!id) return null;
  return prisma.event.findUnique({ where: { id }, include: EVENT_INCLUDE });
}

export async function findBySlug(slug) {
  if (!slug) return null;
  return prisma.event.findUnique({ where: { slug }, include: EVENT_INCLUDE });
}

/** Admin list. `finished` = Published and already ended; newest start first. */
export async function findManyAdmin({ filter = 'all', now = new Date() } = {}) {
  const where = (ADMIN_FILTERS[filter] ?? ADMIN_FILTERS.all)(now);
  return prisma.event.findMany({ where, orderBy: { startsAt: 'desc' }, include: EVENT_INCLUDE });
}

/**
 * Registration counters + survey responses per event, in one round trip.
 * `pending` = open checkouts (PendingPayment); `awaitingApproval` = rows an
 * admin has to approve or reject.
 * @returns {Promise<Map<string, { confirmed, pending, awaitingApproval, rejected, canceled, responses }>>}
 *          every requested id is present (zeros when it has no registrations)
 */
export async function adminStatsByEvent(eventIds) {
  const map = new Map(eventIds.map((id) => [id, { ...EMPTY_STATS }]));
  if (eventIds.length === 0) return map;

  const rows = await prisma.$queryRaw`
    SELECT
      r.event_id,
      COUNT(*) FILTER (WHERE r.status = 'Confirmed')::int      AS confirmed,
      COUNT(*) FILTER (WHERE r.status = 'PendingPayment')::int AS pending,
      COUNT(*) FILTER (WHERE r.status = 'PendingApproval')::int AS awaiting_approval,
      COUNT(*) FILTER (WHERE r.status = 'Rejected')::int       AS rejected,
      COUNT(*) FILTER (WHERE r.status = 'Canceled')::int       AS canceled,
      COUNT(s.id)::int                                         AS responses
    FROM event_registrations r
    LEFT JOIN event_survey_responses s ON s.registration_id = r.id
    WHERE r.event_id = ANY(${eventIds})
    GROUP BY r.event_id`;

  for (const row of rows) {
    map.set(row.event_id, {
      confirmed: Number(row.confirmed),
      pending: Number(row.pending),
      awaitingApproval: Number(row.awaiting_approval),
      rejected: Number(row.rejected),
      canceled: Number(row.canceled),
      responses: Number(row.responses),
    });
  }
  return map;
}

/** Any registration row (any status) — locks the event's pricing. */
export async function countRegistrations(eventId) {
  return prisma.eventRegistration.count({ where: { eventId } });
}

export async function deleteById(id) {
  return prisma.event.delete({ where: { id } });
}

/** The subset of `ids` that are approved, active tutors. */
export async function findApprovedTutors(ids) {
  return prisma.user.findMany({
    where: { id: { in: ids }, isTutorApproved: true, isActive: true },
    select: { id: true, name: true },
  });
}

/** Recipients for event emails. */
export async function findUsersByIds(ids) {
  if (!ids.length) return [];
  return prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true },
  });
}

// ─── Public reads ────────────────────────────────────────────────────────

/**
 * Public reads: tutors with their public rating, never their email. The
 * event row still carries meetingUrl; event.service decides who sees it.
 */
export const EVENT_PUBLIC_INCLUDE = {
  tutors: {
    orderBy: { position: 'asc' },
    include: {
      tutor: {
        select: {
          id: true,
          name: true,
          profilePictureUrl: true,
          tutorProfile: { select: { review: true, numReview: true } },
        },
      },
    },
  },
  course: { select: { id: true, name: true, code: true } },
};

/** Listed, published, not yet ended, soonest first. */
export async function findManyPublic({ now, take }) {
  return prisma.event.findMany({
    where: { status: 'Published', isListed: true, endsAt: { gt: now } },
    orderBy: { startsAt: 'asc' },
    take,
    include: EVENT_PUBLIC_INCLUDE,
  });
}

// ─── Public history: past events with their results ─────────────────────

/**
 * Past events that go in the public history: published, listed, of a real
 * course, and with at least one person who said in the survey they attended
 * (so test events with nobody never show). Latest first.
 */
function pastPublicWhere(now) {
  return {
    status: 'Published',
    isListed: true,
    endsAt: { lt: now },
    ...COUNTED_EVENT_WHERE,
    registrations: { some: { status: 'Confirmed', surveyResponse: { is: { attended: true } } } },
  };
}

export async function findPastPublic({ now, take, skip = 0 }) {
  const where = pastPublicWhere(now);
  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
      take,
      skip,
      include: EVENT_PUBLIC_INCLUDE,
    }),
    prisma.event.count({ where }),
  ]);
  return { events, total };
}

/**
 * Results of each event, one query: confirmed sign-ups, people who said they
 * attended, and the average and count of the event rating from the survey.
 * Every requested id is present (zeros when nobody answered).
 */
export async function publicResultsByEvent(eventIds) {
  const empty = () => ({ registered: 0, attended: 0, ratingSum: 0, ratingCount: 0 });
  const map = new Map(eventIds.map((id) => [id, empty()]));
  if (eventIds.length === 0) return map;

  const rows = await prisma.$queryRaw`
    SELECT
      r.event_id,
      COUNT(*) FILTER (WHERE r.status = 'Confirmed')::int                       AS registered,
      COUNT(*) FILTER (WHERE r.status = 'Confirmed' AND s.attended)::int        AS attended,
      COALESCE(SUM(s.event_rating) FILTER (WHERE r.status = 'Confirmed'), 0)::int AS rating_sum,
      COUNT(s.event_rating) FILTER (WHERE r.status = 'Confirmed')::int           AS rating_count
    FROM event_registrations r
    LEFT JOIN event_survey_responses s ON s.registration_id = r.id
    WHERE r.event_id = ANY(${eventIds})
    GROUP BY r.event_id`;

  for (const row of rows) {
    map.set(row.event_id, {
      registered: Number(row.registered),
      attended: Number(row.attended),
      ratingSum: Number(row.rating_sum),
      ratingCount: Number(row.rating_count),
    });
  }
  return map;
}

/**
 * Public comments of an event: completed tutor reviews with a written comment,
 * newest first. Only what the tutor profile already shows publicly (name and
 * picture of the student, never their email).
 */
export async function findPublicComments(eventId, { take, skip = 0 }) {
  const where = { eventId, status: 'done', comment: { not: null }, NOT: { comment: '' } };
  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: [{ submittedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      take,
      skip,
      select: {
        id: true,
        rating: true,
        comment: true,
        submittedAt: true,
        tutor: { select: { id: true, name: true } },
        student: { select: { name: true, profilePictureUrl: true } },
      },
    }),
    prisma.review.count({ where }),
  ]);
  return { items, total };
}

/** Any status (the caller hides Drafts); hidden events are reachable by slug. */
export async function findPublicBySlug(slug) {
  if (!slug) return null;
  return prisma.event.findUnique({ where: { slug }, include: EVENT_PUBLIC_INCLUDE });
}

/** Published and Canceled events the user tutors, by start. */
export async function findManyForTutor(tutorId) {
  return prisma.event.findMany({
    where: { status: { in: ['Published', 'Canceled'] }, tutors: { some: { tutorId } } },
    orderBy: { startsAt: 'asc' },
    include: EVENT_PUBLIC_INCLUDE,
  });
}

// ─── Admin: survey results and tutor payouts ────────────────────────────

/** Per-tutor rating average and count over the event's completed reviews. */
export async function reviewStatsByTutor(eventId) {
  return prisma.review.groupBy({
    by: ['tutorId'],
    where: { eventId, status: 'done' },
    _avg: { rating: true },
    _count: { id: true },
  });
}

/** Completed reviews, for moderation, newest first. */
export async function findEventReviews(eventId) {
  return prisma.review.findMany({
    where: { eventId, status: 'done' },
    orderBy: [{ submittedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    select: {
      id: true,
      rating: true,
      comment: true,
      tutor: { select: { name: true } },
      student: { select: { name: true } },
    },
  });
}

/** One review scoped to its event (null when it belongs to another). */
export async function findEventReview(eventId, reviewId) {
  return prisma.review.findFirst({
    where: { id: reviewId, eventId },
    select: { id: true, tutorId: true, studentId: true, rating: true, comment: true },
  });
}

export async function findTutorPayouts(eventId) {
  return prisma.eventTutorPayout.findMany({
    where: { eventId },
    orderBy: { paidAt: 'desc' },
    include: { tutor: { select: { name: true, email: true } } },
  });
}

export async function createTutorPayout(data) {
  return prisma.eventTutorPayout.create({
    data,
    include: { tutor: { select: { name: true, email: true } } },
  });
}
