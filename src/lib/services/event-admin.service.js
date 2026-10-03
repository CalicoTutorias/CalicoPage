/**
 * Event Admin Service
 * Admin side of events: create, edit, publish (optionally with a Google Meet
 * on Calico's central calendar), cancel (cancels every registration and
 * queues the refunds) and delete drafts. Every mutation is audited.
 *
 * Rules (spec §5.8, §5.9, §7):
 *   - Drafts are freely editable and deletable. Published events can only be
 *     cancelled, and their modality / autoMeet are fixed.
 *   - price / earlyBirdSlots / earlyBirdPercent lock once any registration
 *     row exists.
 *   - Publishing an autoMeet event creates the Meet first; if that fails the
 *     event stays Draft (CALENDAR_ERROR).
 *   - Cancelling runs under the event row lock. Emails and the calendar
 *     cleanup run after the commit and never fail the cancel.
 *
 * Every error carries `err.code` from EVENT_ADMIN_ERROR; VALIDATION_ERROR
 * also carries `err.rule` (an event-rules / event-pricing code) and `err.field`.
 */

import prisma from '../prisma';
import * as eventRepo from '../repositories/event.repository';
import * as eventRegRepo from '../repositories/event-registration.repository';
import * as auditService from './admin-audit.service';
import { createEventMeeting, updateEventMeeting, cancelEventMeeting } from './calico-calendar.service';
import { sendEventCanceledTo } from './event-email.service';
import { resolveEventImageKey } from './event-image.service';
import { validateEventDraft, assertPublishable } from '../events/event-rules';
import { buildEventSlug } from '../utils/slug';

const { ADMIN_ACTIONS } = auditService;

export const EVENT_ADMIN_ERROR = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  PRICE_LOCKED: 'PRICE_LOCKED',
  INVALID_STATE: 'INVALID_STATE',
  CALENDAR_ERROR: 'CALENDAR_ERROR',
});

function domainError(message, code, extra = {}) {
  const err = new Error(message);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

const SLUG_ATTEMPTS = 3;
const LIST_FILTERS = new Set(['all', 'draft', 'published', 'finished', 'canceled']);

/** Admin-editable event fields (besides tutorIds and the cover image). */
const DRAFT_FIELDS = [
  'title', 'description', 'courseId', 'startsAt', 'endsAt', 'modality', 'autoMeet',
  'meetingUrl', 'location', 'price', 'earlyBirdSlots', 'earlyBirdPercent', 'isListed',
];
const PRICING_FIELDS = ['price', 'earlyBirdSlots', 'earlyBirdPercent'];
const MEETING_FIELDS = ['title', 'description', 'startsAt', 'endsAt'];

// ─── Normalisation ───────────────────────────────────────────────────────

const blankToNull = (v) => (v === undefined || v === null || v === '' ? null : v);
const intOrNull = (v) => (blankToNull(v) === null ? null : Number(v));
const trimOrNull = (v) => blankToNull(typeof v === 'string' ? v.trim() : v);

/**
 * Canonical draft from admin input (create) or from the input merged over the
 * stored event (update): integer price, null instead of the form's empty
 * strings, no pasted link when autoMeet, no location when Virtual.
 */
function normalizeDraft(input) {
  const autoMeet = Boolean(input.autoMeet);
  return {
    title: String(input.title ?? '').trim(),
    description: String(input.description ?? '').trim(),
    courseId: blankToNull(input.courseId),
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
    modality: input.modality,
    autoMeet,
    meetingUrl: autoMeet ? null : trimOrNull(input.meetingUrl),
    location: input.modality === 'Virtual' ? null : trimOrNull(input.location),
    price: Number(String(input.price)),
    earlyBirdSlots: intOrNull(input.earlyBirdSlots),
    earlyBirdPercent: intOrNull(input.earlyBirdPercent),
    isListed: Boolean(input.isListed ?? true),
    tutorIds: [...(input.tutorIds ?? [])],
  };
}

/** A stored event in input shape (tutorIds in display order). */
function storedInput(event) {
  return {
    ...Object.fromEntries(DRAFT_FIELDS.map((k) => [k, event[k]])),
    tutorIds: (event.tutors ?? []).map((t) => t.tutorId ?? t.tutor?.id),
  };
}

function sameValue(a, b) {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

function assertValidDraft(problem) {
  if (problem) {
    throw domainError(`Datos del evento inválidos (${problem.code})`, 'VALIDATION_ERROR', {
      rule: problem.code,
      field: problem.field,
    });
  }
}

async function assertApprovedTutors(tutorIds) {
  const approved = await eventRepo.findApprovedTutors(tutorIds);
  if (approved.length < tutorIds.length) {
    throw domainError('Todos los tutores deben ser tutores aprobados y activos', 'VALIDATION_ERROR', {
      rule: 'TUTOR_NOT_APPROVED',
      field: 'tutorIds',
    });
  }
}

async function loadEvent(id) {
  const event = await eventRepo.findById(id);
  if (!event) throw domainError('Evento no encontrado', 'NOT_FOUND');
  return event;
}

const meetingDetails = (d) => ({ title: d.title, description: d.description, startsAt: d.startsAt, endsAt: d.endsAt });

// ─── Serialization ───────────────────────────────────────────────────────

function derivedStatus(event, now) {
  if (event.status === 'Draft') return 'draft';
  if (event.status === 'Canceled') return 'canceled';
  return new Date(event.endsAt) < now ? 'finished' : 'published';
}

/**
 * Admin view of an event: every scalar (meetingUrl included) plus a numeric
 * price, the tutors in order, the course, the registration stats and the
 * derived status ('draft' | 'published' | 'finished' | 'canceled').
 * `stats` is null on mutation results (not recomputed there).
 */
export function serializeAdminEvent(event, stats = null, now = new Date()) {
  const { tutors = [], course = null, ...scalars } = event;
  return {
    ...scalars,
    price: Number(event.price),
    tutors: tutors.map((t) => t.tutor),
    course,
    stats,
    derivedStatus: derivedStatus(event, now),
  };
}

// ─── Reads ───────────────────────────────────────────────────────────────

export async function listEventsAdmin({ filter = 'all', now = new Date() } = {}) {
  const safeFilter = LIST_FILTERS.has(filter) ? filter : 'all';
  const events = await eventRepo.findManyAdmin({ filter: safeFilter, now });
  const stats = await eventRepo.adminStatsByEvent(events.map((e) => e.id));
  return events.map((e) => serializeAdminEvent(e, stats.get(e.id), now));
}

export async function getEventAdmin(id, { now = new Date() } = {}) {
  const event = await loadEvent(id);
  const stats = await eventRepo.adminStatsByEvent([id]);
  return serializeAdminEvent(event, stats.get(id), now);
}

// ─── Create ──────────────────────────────────────────────────────────────

/** P2002 on events.slug. Columns come in meta.target, or under meta.driverAdapterError with driver adapters. */
function isSlugConflict(err) {
  if (err?.code !== 'P2002') return false;
  const fields = err.meta?.target ?? err.meta?.driverAdapterError?.cause?.constraint?.fields;
  return [].concat(fields ?? []).some((f) => String(f).includes('slug'));
}

async function createWithUniqueSlug(data, tutorIds) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await eventRepo.create({ data: { ...data, slug: buildEventSlug(data.title) }, tutorIds });
    } catch (err) {
      if (attempt >= SLUG_ATTEMPTS || !isSlugConflict(err)) throw err;
    }
  }
}

export async function createEvent({ adminId, data, request }) {
  const draft = normalizeDraft(data);
  assertValidDraft(validateEventDraft(draft));
  await assertApprovedTutors(draft.tutorIds);
  const coverImageUrl = data.coverImageKey ? await resolveEventImageKey(data.coverImageKey) : null;

  const { tutorIds, ...fields } = draft;
  const created = await createWithUniqueSlug(
    { ...fields, coverImageUrl, status: 'Draft', createdById: adminId },
    tutorIds,
  );

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.EVENT_CREATE,
    targetType: 'Event',
    targetId: created.id,
    payload: {
      slug: created.slug,
      title: draft.title,
      startsAt: draft.startsAt,
      modality: draft.modality,
      price: draft.price,
      earlyBirdSlots: draft.earlyBirdSlots,
      earlyBirdPercent: draft.earlyBirdPercent,
      tutorIds,
    },
    request,
  });

  return serializeAdminEvent(created);
}

// ─── Update ──────────────────────────────────────────────────────────────

/**
 * Partial update merged over the stored event. Only changed fields are
 * written; the slug never changes. For a Published autoMeet event the
 * generated Meet link is kept and a time/title change patches the calendar
 * event (best-effort → `calendarWarning: true` when it fails).
 *
 * `data.coverImageKey`: undefined = untouched, null = remove, key = replace.
 * @returns {Promise<{ event: object, calendarWarning?: true }>}
 */
export async function updateEvent({ adminId, id, data, request }) {
  const event = await loadEvent(id);
  if (event.status === 'Canceled') {
    throw domainError('Un evento cancelado no se puede editar', 'INVALID_STATE');
  }
  if (event.status === 'Published') {
    const fixed = ['modality', 'autoMeet'].find((k) => data[k] !== undefined && data[k] !== event[k]);
    if (fixed) {
      throw domainError(
        'La modalidad y el Meet automático no se pueden cambiar en un evento publicado',
        'INVALID_STATE',
        { field: fixed },
      );
    }
  }

  const changes = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  const before = normalizeDraft(storedInput(event));
  const after = normalizeDraft({ ...storedInput(event), ...changes });

  if (PRICING_FIELDS.some((k) => !sameValue(before[k], after[k]))) {
    if ((await eventRepo.countRegistrations(id)) > 0) {
      throw domainError(
        'El precio y el descuento no se pueden cambiar porque el evento ya tiene inscripciones',
        'PRICE_LOCKED',
      );
    }
  }

  assertValidDraft(validateEventDraft(after));
  const tutorsChanged = !sameValue(before.tutorIds, after.tutorIds);
  if (tutorsChanged) await assertApprovedTutors(after.tutorIds);

  const patch = {};
  for (const k of DRAFT_FIELDS) {
    if (!sameValue(before[k], after[k])) patch[k] = after[k];
  }
  if (changes.coverImageKey !== undefined) {
    const coverImageUrl = changes.coverImageKey === null ? null : await resolveEventImageKey(changes.coverImageKey);
    if (coverImageUrl !== event.coverImageUrl) patch.coverImageUrl = coverImageUrl;
  }

  const fields = [...Object.keys(patch), ...(tutorsChanged ? ['tutorIds'] : [])];
  if (fields.length === 0) return { event: serializeAdminEvent(event) };

  const updated = await eventRepo.update(id, patch, tutorsChanged ? after.tutorIds : undefined);

  let calendarWarning = false;
  if (event.googleCalendarEventId && MEETING_FIELDS.some((k) => k in patch)) {
    try {
      await updateEventMeeting(event.googleCalendarEventId, meetingDetails(after));
    } catch (err) {
      calendarWarning = true;
      console.warn(`[event-admin] Meet update failed for event ${id}:`, err?.code || err?.message);
    }
  }

  const pick = (src, extra) => Object.fromEntries(fields.map((k) => [k, k === 'coverImageUrl' ? extra : src[k]]));
  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.EVENT_UPDATE,
    targetType: 'Event',
    targetId: id,
    payload: {
      slug: event.slug,
      fields,
      before: pick(before, event.coverImageUrl),
      after: pick(after, patch.coverImageUrl),
      ...(calendarWarning ? { calendarWarning } : {}),
    },
    request,
  });

  return { event: serializeAdminEvent(updated), ...(calendarWarning ? { calendarWarning: true } : {}) };
}

// ─── Publish ─────────────────────────────────────────────────────────────

function calendarError() {
  return domainError('No se pudo crear la reunión de Google Meet', 'CALENDAR_ERROR');
}

/** Create the Meet or throw CALENDAR_ERROR (removing a Meet-less calendar event). */
async function createMeetOrThrow(eventId, draft) {
  let meeting;
  try {
    meeting = await createEventMeeting(meetingDetails(draft));
  } catch (err) {
    console.error(`[event-admin] Meet creation failed for event ${eventId}:`, err?.code || err?.message);
    throw calendarError();
  }
  if (!meeting?.meetLink) {
    if (meeting?.calendarEventId) {
      try {
        await cancelEventMeeting(meeting.calendarEventId);
      } catch (err) {
        console.warn(`[event-admin] Could not remove Meet-less calendar event ${meeting.calendarEventId}:`, err?.code || err?.message);
      }
    }
    throw calendarError();
  }
  return { meetingUrl: meeting.meetLink, googleCalendarEventId: meeting.calendarEventId };
}

export async function publishEvent({ adminId, id, request, now = new Date() }) {
  const event = await loadEvent(id);
  if (event.status !== 'Draft') throw domainError('Solo se puede publicar un borrador', 'INVALID_STATE');

  const draft = normalizeDraft(storedInput(event));
  assertValidDraft(assertPublishable(draft, now));
  await assertApprovedTutors(draft.tutorIds);

  const patch = { status: 'Published', publishedAt: now };
  if (event.autoMeet) Object.assign(patch, await createMeetOrThrow(id, draft));

  const updated = await eventRepo.update(id, patch);

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.EVENT_PUBLISH,
    targetType: 'Event',
    targetId: id,
    payload: { slug: event.slug, title: event.title, autoMeet: event.autoMeet, googleCalendarEventId: patch.googleCalendarEventId ?? null },
    request,
  });

  return serializeAdminEvent(updated, null, now);
}

// ─── Cancel ──────────────────────────────────────────────────────────────

/** Email every previously-Confirmed registrant. Never throws. */
async function notifyCanceled(event, confirmed) {
  if (confirmed.length === 0) return { sent: 0, failed: 0 };
  try {
    const users = await eventRepo.findUsersByIds(confirmed.map((r) => r.userId));
    const byId = new Map(users.map((u) => [u.id, u]));
    const results = await Promise.allSettled(confirmed.map((r) => {
      const user = byId.get(r.userId);
      if (!user) return Promise.reject(new Error(`User ${r.userId} not found`));
      return sendEventCanceledTo({ event, user, amountPaid: Number(r.finalAmount) });
    }));
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) {
      console.warn(`[event-admin] ${failed.length} cancellation email(s) failed for event ${event.id}:`, failed[0].reason?.message);
    }
    return { sent: results.length - failed.length, failed: failed.length };
  } catch (err) {
    console.error(`[event-admin] Could not email the registrants of canceled event ${event.id}:`, err?.message);
    return { sent: 0, failed: confirmed.length };
  }
}

/**
 * Cancel a Published event (spec §5.8). In one transaction under the event
 * row lock: every Confirmed/PendingPayment registration → Canceled, every
 * payment not yet in the refund flow → refund Pending, the event → Canceled.
 * After the commit: email the previously-Confirmed registrants, cancel the
 * Meet, audit.
 */
export async function cancelEvent({ adminId, id, reason, request, now = new Date() }) {
  const event = await loadEvent(id);
  if (event.status !== 'Published') throw domainError('Solo se puede cancelar un evento publicado', 'INVALID_STATE');
  const cancelReason = trimOrNull(reason);

  const { canceled, confirmed } = await prisma.$transaction(async (tx) => {
    const locked = await eventRegRepo.lockEvent(tx, id);
    if (!locked || locked.status !== 'Published') {
      throw domainError('Solo se puede cancelar un evento publicado', 'INVALID_STATE');
    }
    const { confirmed: confirmedRows } = await eventRegRepo.cancelAllForEvent(tx, id, now);
    const row = await tx.event.update({
      where: { id },
      data: { status: 'Canceled', canceledAt: now, cancelReason },
      include: eventRepo.EVENT_INCLUDE,
    });
    return { canceled: row, confirmed: confirmedRows };
  });

  const emails = await notifyCanceled(canceled, confirmed);

  if (canceled.googleCalendarEventId) {
    try {
      await cancelEventMeeting(canceled.googleCalendarEventId);
    } catch (err) {
      console.warn(`[event-admin] Meet cancel failed for event ${id}:`, err?.code || err?.message);
    }
  }

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.EVENT_CANCEL,
    targetType: 'Event',
    targetId: id,
    payload: {
      slug: event.slug,
      title: event.title,
      reason: cancelReason,
      confirmedRegistrations: confirmed.length,
      emailsSent: emails.sent,
      emailsFailed: emails.failed,
    },
    request,
  });

  return serializeAdminEvent(canceled, null, now);
}

// ─── Delete ──────────────────────────────────────────────────────────────

export async function deleteDraftEvent({ adminId, id, request }) {
  const event = await loadEvent(id);
  if (event.status !== 'Draft') {
    throw domainError('Solo se puede eliminar un borrador; un evento publicado se cancela', 'INVALID_STATE');
  }

  await eventRepo.deleteById(id);

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.EVENT_DELETE,
    targetType: 'Event',
    targetId: id,
    payload: { slug: event.slug, title: event.title },
    request,
  });

  return { id };
}
