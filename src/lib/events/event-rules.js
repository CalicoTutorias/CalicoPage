import { validateEventPricing } from '../payments/event-pricing';
import { validateSessions } from './event-sessions';

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
  const sessions = Array.isArray(d.sessions) && d.sessions.length > 0 ? d.sessions : null;
  if (sessions) {
    // Varios días: cada sesión se valida sola; startsAt/endsAt se derivan de ellas.
    const problem = validateSessions(sessions, d.timeTbc);
    if (problem) return problem;
  }
  const start = new Date(d.startsAt);
  const end = new Date(d.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { code: 'INVALID_DATES', field: 'startsAt' };
  if (end <= start) return { code: 'ENDS_BEFORE_START', field: 'endsAt' };
  if (!sessions && d.timeTbc) {
    // Hora por confirmar: start/end solo delimitan el día; lo que vale es la duración.
    const hours = Number(d.durationHours);
    if (!(hours > 0) || hours > EVENT_MAX_DURATION_HOURS) return { code: 'DURATION_INVALID', field: 'durationHours' };
  } else if (!sessions && end - start > EVENT_MAX_DURATION_HOURS * 3_600_000) {
    return { code: 'TOO_LONG', field: 'endsAt' };
  }

  if (d.modality === 'Virtual') {
    if (!d.autoMeet && !d.meetingUrl && !d.whatsappUrl) return { code: 'MEETING_URL_REQUIRED', field: 'meetingUrl' };
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
  // Approval events never go through Wompi, so there is no checkout to discount.
  if (d.requiresApproval && (d.earlyBirdSlots ?? null) !== null) {
    return { code: 'EARLY_BIRD_WITH_APPROVAL', field: 'requiresApproval' };
  }

  if (!Array.isArray(d.tutorIds) || d.tutorIds.length === 0) return { code: 'TUTORS_REQUIRED', field: 'tutorIds' };
  return null;
}

export function assertPublishable(event, now = new Date()) {
  // Con hora por confirmar, startsAt es la medianoche del día: vale mientras el día no termine.
  // Con varios días cuenta la primera sesión.
  const first = Array.isArray(event.sessions) && event.sessions.length > 0 ? event.sessions[0] : event;
  const reference = event.timeTbc ? first.endsAt : first.startsAt;
  if (new Date(reference) <= now) return { code: 'STARTS_IN_PAST', field: 'startsAt' };
  return validateEventDraft(event);
}
