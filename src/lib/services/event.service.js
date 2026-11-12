/**
 * Event reads: the public listing and detail page, the OG metadata of the
 * event page, the student's "my events" and the tutor's events.
 *
 * meetingUrl is the one secret on an event. The public shape never carries
 * it; it is added only for a Confirmed registrant of a non-canceled event
 * (myRegistration) and for the event's own tutors (getTutorEvents). On an
 * approval event a PendingApproval or Rejected registrant does not get it.
 */

import prisma from '../prisma';
import * as eventRepo from '../repositories/event.repository';
import * as eventRegRepo from '../repositories/event-registration.repository';
import * as materialRepo from '../repositories/event-material.repository';
import { isAdmin } from '../auth/guards';
import { quoteEvent, isRefundableAt, EVENT_HOLD_MINUTES } from '../payments/event-pricing';

const PUBLIC_LIMIT = 50;
/** Below this many ratings the average is not shown: one 5 says little. */
export const MIN_RATINGS_TO_SHOW = 3;
export const PAST_PAGE_SIZE = 12;
export const COMMENTS_PAGE_SIZE = 10;
const META_DESCRIPTION_MAX = 160;

/** Same code as EVENT_ERROR.NOT_FOUND in event-checkout.service. */
function notFound() {
  const err = new Error('EVENT_NOT_FOUND');
  err.code = 'EVENT_NOT_FOUND';
  return err;
}

function hasEarlyBird(event) {
  return Number(event.price) > 0 && event.earlyBirdSlots > 0 && event.earlyBirdPercent > 0;
}

/** Early-bird seats in use per event (confirmed + live holds), one query. */
function earlyBirdUsage(events) {
  return eventRegRepo.earlyBirdUsageByEvent(events.filter(hasEarlyBird).map((e) => e.id), EVENT_HOLD_MINUTES);
}

/**
 * Seats in use as the viewer's own checkout would count them: their own row
 * is left out (startCheckout's countEarlyBirdUsage rule), so a viewer
 * holding a fresh early-bird hold is shown the price they will be charged.
 */
async function earlyBirdUsageForViewer(event, viewerId) {
  const n = await eventRegRepo.countEarlyBirdUsage(prisma, {
    eventId: event.id, excludeUserId: viewerId, holdMinutes: EVENT_HOLD_MINUTES,
  });
  return new Map([[event.id, n]]);
}

function publicTutor({ tutor }) {
  return {
    id: tutor.id,
    name: tutor.name,
    profilePictureUrl: tutor.profilePictureUrl ?? null,
    rating: Number(tutor.tutorProfile?.review ?? 0),
    numReview: tutor.tutorProfile?.numReview ?? 0,
  };
}

/** The shape every public endpoint returns. Built field by field: no secret can slip through. */
function publicEvent(event, usage, now) {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description,
    coverImageUrl: event.coverImageUrl ?? null,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    modality: event.modality,
    location: event.modality === 'InPerson' ? event.location ?? null : null,
    price: Number(event.price),
    earlyBird: hasEarlyBird(event)
      ? {
          slots: event.earlyBirdSlots,
          percent: event.earlyBirdPercent,
          remaining: Math.max(0, event.earlyBirdSlots - (usage.get(event.id) ?? 0)),
          discountedPrice: quoteEvent(event, { earlyBird: true }).finalAmount,
        }
      : null,
    status: event.status,
    isListed: event.isListed,
    requiresApproval: Boolean(event.requiresApproval),
    registrationOpen: event.status === 'Published' && now < new Date(event.startsAt),
    hasEnded: now >= new Date(event.endsAt),
    course: event.course ? { id: event.course.id, name: event.course.name, code: event.course.code } : null,
    tutors: (event.tutors ?? []).map(publicTutor),
  };
}

/**
 * The viewer's own registration, with what they may do next. A pending
 * approval request can be withdrawn (never refunded: nothing was paid).
 * `materialsCount` (null = not looked up) becomes `materials` for a Confirmed
 * registrant: how many files there are and whether the survey unlocked them.
 */
function viewerRegistration(registration, event, now, materialsCount = null) {
  if (!registration) return null;
  const confirmed = registration.status === 'Confirmed';
  const pendingApproval = registration.status === 'PendingApproval';
  const startsAt = new Date(event.startsAt);
  const finalAmount = Number(registration.finalAmount);
  const canCancel = (confirmed || pendingApproval) && event.status === 'Published' && now < startsAt;
  const ended = now >= new Date(event.endsAt);
  let surveyStatus = 'none';
  if (confirmed && ended) surveyStatus = registration.surveyResponse ? 'submitted' : 'pending';

  return {
    status: registration.status,
    earlyBird: registration.earlyBird,
    finalAmount,
    confirmedAt: registration.confirmedAt ?? null,
    canCancel,
    refundable: confirmed && canCancel && finalAmount > 0 && isRefundableAt(startsAt, now),
    surveyStatus,
    // Whether they said in the survey that they attended (null = no answer yet).
    attended: registration.surveyResponse ? Boolean(registration.surveyResponse.attended) : null,
    meetingUrl: confirmed && event.status !== 'Canceled' ? event.meetingUrl ?? null : null,
    materials: confirmed && materialsCount !== null
      ? { count: materialsCount, unlocked: surveyStatus === 'submitted' }
      : null,
  };
}

/**
 * Public results of an event: sign-ups, attendance and the survey rating. The
 * average only shows from MIN_RATINGS_TO_SHOW ratings; the count always shows.
 */
function publicResults(stats) {
  const { registered, attended, ratingSum, ratingCount } = stats;
  return {
    registered,
    attended,
    ratingCount,
    ratingAverage: ratingCount >= MIN_RATINGS_TO_SHOW ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
  };
}

/** Public history: past events with their results, latest first, one page at a time. */
export async function listPastEvents({ page = 1, pageSize = PAST_PAGE_SIZE, now = new Date() } = {}) {
  const take = Math.min(Math.max(pageSize, 1), 50);
  const skip = (Math.max(page, 1) - 1) * take;
  const { events, total } = await eventRepo.findPastPublic({ now, take, skip });
  const results = await eventRepo.publicResultsByEvent(events.map((e) => e.id));
  const noEarlyBird = new Map();
  return {
    events: events.map((event) => ({
      ...publicEvent(event, noEarlyBird, now),
      earlyBird: null, // over: no seats to sell
      results: publicResults(results.get(event.id)),
    })),
    total,
    hasMore: skip + events.length < total,
  };
}

function publicComment(review) {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment.trim(),
    submittedAt: review.submittedAt ?? null,
    tutor: review.tutor ? { id: review.tutor.id, name: review.tutor.name } : null,
    student: { name: review.student?.name ?? null, profilePictureUrl: review.student?.profilePictureUrl ?? null },
  };
}

/**
 * The results block of an event page, once the event is over: the figures and
 * the public comments (reviews of its tutors). Drafts, canceled events and
 * events still to come have none.
 */
export async function getEventResults({ slug, page = 1, now = new Date() }) {
  const event = await eventRepo.findPublicBySlug(slug);
  if (!event || event.status !== 'Published') throw notFound();
  if (now < new Date(event.endsAt)) return { ended: false, results: null, comments: [], totalComments: 0, hasMore: false };

  const skip = (Math.max(page, 1) - 1) * COMMENTS_PAGE_SIZE;
  const [stats, { items, total }] = await Promise.all([
    eventRepo.publicResultsByEvent([event.id]),
    eventRepo.findPublicComments(event.id, { take: COMMENTS_PAGE_SIZE, skip }),
  ]);
  const comments = items.filter((r) => r.comment?.trim()).map(publicComment);
  return {
    ended: true,
    results: publicResults(stats.get(event.id)),
    comments,
    totalComments: total,
    hasMore: skip + items.length < total,
  };
}

export async function listPublicEvents({ now = new Date() } = {}) {
  const events = await eventRepo.findManyPublic({ now, take: PUBLIC_LIMIT });
  const usage = await earlyBirdUsage(events);
  return events.map((event) => publicEvent(event, usage, now));
}

/** Drafts are 404 except for admins (preview); hidden events are reachable by slug. */
export async function getPublicEvent({ slug, viewerId = null, now = new Date() }) {
  const event = await eventRepo.findPublicBySlug(slug);
  if (!event) throw notFound();
  if (event.status === 'Draft' && !(viewerId && (await isAdmin(viewerId)))) throw notFound();

  const usage = viewerId && hasEarlyBird(event)
    ? await earlyBirdUsageForViewer(event, viewerId)
    : await earlyBirdUsage([event]);
  const registration = viewerId ? await eventRegRepo.findViewerRegistration(event.id, viewerId) : null;
  const materialsCount = registration?.status === 'Confirmed' ? await materialRepo.countByEvent(event.id) : null;
  return {
    event: publicEvent(event, usage, now),
    myRegistration: viewerRegistration(registration, event, now, materialsCount),
  };
}

export async function getMyEvents(userId, now = new Date()) {
  const rows = await eventRegRepo.findUserRegistrations(userId);
  const usage = await earlyBirdUsage(rows.map((r) => r.event));
  return rows.map((r) => ({
    id: r.id,
    ...viewerRegistration(r, r.event, now),
    event: publicEvent(r.event, usage, now),
  }));
}

/** The tutor needs the link and the headcount of their own events. */
export async function getTutorEvents(tutorId, now = new Date()) {
  const events = await eventRepo.findManyForTutor(tutorId);
  const [usage, stats] = await Promise.all([
    earlyBirdUsage(events),
    eventRepo.adminStatsByEvent(events.map((e) => e.id)),
  ]);
  return events.map((event) => ({
    ...publicEvent(event, usage, now),
    meetingUrl: event.meetingUrl ?? null,
    confirmedCount: stats.get(event.id)?.confirmed ?? 0,
  }));
}

/** For generateMetadata on /eventos/[slug] (server-side, documented exception). */
export async function getEventMetaForPage(slug) {
  const event = await eventRepo.findPublicBySlug(slug);
  if (!event || event.status === 'Draft') return null;
  const description = event.description ?? '';
  return {
    title: event.title,
    description: description.length > META_DESCRIPTION_MAX
      ? `${description.slice(0, META_DESCRIPTION_MAX - 1)}…`
      : description,
    coverImageUrl: event.coverImageUrl ?? null,
  };
}
