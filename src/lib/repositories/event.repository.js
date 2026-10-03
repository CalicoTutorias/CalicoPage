/**
 * Event Repository
 * Prisma wrappers for Event + EventTutor (+ the user lookups the admin flows
 * need). Business rules live in event-admin.service.js.
 *
 * Models: Event, EventTutor
 */

import prisma from '../prisma';

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

const EMPTY_STATS = Object.freeze({ confirmed: 0, pending: 0, canceled: 0, responses: 0 });

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
 * @returns {Promise<Map<string, { confirmed, pending, canceled, responses }>>}
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
