import { validateEventPricing } from '../payments/event-pricing';

export const EVENT_MAX_DURATION_HOURS = 12;

/**
 * Options for the interactive transactions that take the event row lock
 * (register, checkout, fulfil, cancel, survey, admin cancel). They all queue
 * on that one row, so a launch-day burst needs more than Prisma's 2 s default
 * wait for a connection.
 */
export const EVENT_TX_OPTIONS = Object.freeze({ maxWait: 10_000, timeout: 15_000 });

/**
 * Cross-field rules for a complete event draft (create input, or an update
 * merged over the stored event). Field shapes are already checked by zod.
 * @returns {{ code: string, field: string } | null}
 */
export function validateEventDraft(d) {
  const start = new Date(d.startsAt);
  const end = new Date(d.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { code: 'INVALID_DATES', field: 'startsAt' };
  if (end <= start) return { code: 'ENDS_BEFORE_START', field: 'endsAt' };
  if (end - start > EVENT_MAX_DURATION_HOURS * 3_600_000) return { code: 'TOO_LONG', field: 'endsAt' };

  if (d.modality === 'Virtual') {
    if (!d.autoMeet && !d.meetingUrl) return { code: 'MEETING_URL_REQUIRED', field: 'meetingUrl' };
  } else if (d.modality === 'InPerson') {
    if (!d.location || !String(d.location).trim()) return { code: 'LOCATION_REQUIRED', field: 'location' };
    if (d.autoMeet) return { code: 'AUTO_MEET_NOT_VIRTUAL', field: 'autoMeet' };
  } else {
    return { code: 'INVALID_MODALITY', field: 'modality' };
  }

  const pricing = validateEventPricing({
    price: d.price,
    earlyBirdSlots: d.earlyBirdSlots ?? null,
    earlyBirdPercent: d.earlyBirdPercent ?? null,
  });
  if (pricing) return { code: pricing, field: 'price' };

  if (!Array.isArray(d.tutorIds) || d.tutorIds.length === 0) return { code: 'TUTORS_REQUIRED', field: 'tutorIds' };
  return null;
}

export function assertPublishable(event, now = new Date()) {
  if (new Date(event.startsAt) <= now) return { code: 'STARTS_IN_PAST', field: 'startsAt' };
  return validateEventDraft(event);
}
