/**
 * Event reads: the public listing and detail page, the OG metadata of the
 * event page, the student's "my events" and the tutor's events.
 *
 * meetingUrl is the one secret on an event. The public shape never carries
 * it; it is added only for a Confirmed registrant of a non-canceled event
 * (myRegistration) and for the event's own tutors (getTutorEvents).
 */

import * as eventRepo from '../repositories/event.repository';
import * as eventRegRepo from '../repositories/event-registration.repository';
import { isAdmin } from '../auth/guards';
import { quoteEvent, isRefundableAt, EVENT_HOLD_MINUTES } from '../payments/event-pricing';

const PUBLIC_LIMIT = 50;
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
    registrationOpen: event.status === 'Published' && now < new Date(event.startsAt),
    hasEnded: now >= new Date(event.endsAt),
    course: event.course ? { id: event.course.id, name: event.course.name, code: event.course.code } : null,
    tutors: (event.tutors ?? []).map(publicTutor),
  };
}

/** The viewer's own registration, with what they may do next. */
function viewerRegistration(registration, event, now) {
  if (!registration) return null;
  const confirmed = registration.status === 'Confirmed';
  const startsAt = new Date(event.startsAt);
  const finalAmount = Number(registration.finalAmount);
  const canCancel = confirmed && event.status === 'Published' && now < startsAt;
  const ended = now >= new Date(event.endsAt);
  let surveyStatus = 'none';
  if (confirmed && ended) surveyStatus = registration.surveyResponse ? 'submitted' : 'pending';

  return {
    status: registration.status,
    earlyBird: registration.earlyBird,
    finalAmount,
    confirmedAt: registration.confirmedAt ?? null,
    canCancel,
    refundable: canCancel && finalAmount > 0 && isRefundableAt(startsAt, now),
    surveyStatus,
    meetingUrl: confirmed && event.status !== 'Canceled' ? event.meetingUrl ?? null : null,
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

  const usage = await earlyBirdUsage([event]);
  const registration = viewerId ? await eventRegRepo.findViewerRegistration(event.id, viewerId) : null;
  return {
    event: publicEvent(event, usage, now),
    myRegistration: viewerRegistration(registration, event, now),
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
