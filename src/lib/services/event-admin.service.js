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
import { toCsv } from '../utils/csv';
import { eventPaymentTotals } from '../payments/fees';

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

/**
 * Resolve a cover key. A missing or invalid upload is a form error on
 * coverImageKey, never a 404 that would read as "event not found".
 */
async function resolveCover(s3Key) {
  try {
    return await resolveEventImageKey(s3Key);
  } catch (err) {
    if (err?.code === 'NOT_FOUND' || err?.code === 'VALIDATION_ERROR') {
      throw domainError(err.message, 'VALIDATION_ERROR', { rule: 'COVER_IMAGE_INVALID', field: 'coverImageKey' });
    }
    throw err;
  }
}

/**
 * P2003 on events.course_id. The constraint comes in meta.field_name, or under
 * meta.driverAdapterError with driver adapters ({ index } or { fields }).
 */
function isCourseFkViolation(err) {
  if (err?.code !== 'P2003') return false;
  const constraint = err.meta?.driverAdapterError?.cause?.constraint;
  return [err.meta?.field_name, constraint?.index, ...(constraint?.fields ?? [])]
    .some((name) => typeof name === 'string' && name.includes('course_id'));
}

function rethrowCourseNotFound(err) {
  if (isCourseFkViolation(err)) {
    throw domainError('El curso no existe', 'VALIDATION_ERROR', { rule: 'COURSE_NOT_FOUND', field: 'courseId' });
  }
  throw err;
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
  const coverImageUrl = data.coverImageKey ? await resolveCover(data.coverImageKey) : null;

  const { tutorIds, ...fields } = draft;
  const created = await createWithUniqueSlug(
    { ...fields, coverImageUrl, status: 'Draft', createdById: adminId },
    tutorIds,
  ).catch(rethrowCourseNotFound);

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
    const coverImageUrl = changes.coverImageKey === null ? null : await resolveCover(changes.coverImageKey);
    if (coverImageUrl !== event.coverImageUrl) patch.coverImageUrl = coverImageUrl;
  }

  const fields = [...Object.keys(patch), ...(tutorsChanged ? ['tutorIds'] : [])];
  if (fields.length === 0) return { event: serializeAdminEvent(event) };

  const updated = await eventRepo
    .update(id, patch, tutorsChanged ? after.tutorIds : undefined)
    .catch(rethrowCourseNotFound);

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

/** Best-effort removal of a calendar event that will not be used. Never throws. */
async function discardMeeting(calendarEventId) {
  if (!calendarEventId) return;
  try {
    await cancelEventMeeting(calendarEventId);
  } catch (err) {
    console.warn(`[event-admin] Could not remove unused calendar event ${calendarEventId}:`, err?.code || err?.message);
  }
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
    await discardMeeting(meeting?.calendarEventId);
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

  // Guarded Draft → Published write: a concurrent publish loses with
  // INVALID_STATE. Either way a Meet this call created but did not store is
  // cancelled.
  let updated;
  try {
    updated = await eventRepo.updateIfStatus(id, 'Draft', patch);
  } catch (err) {
    await discardMeeting(patch.googleCalendarEventId);
    throw err;
  }
  if (!updated) {
    await discardMeeting(patch.googleCalendarEventId);
    throw domainError('Solo se puede publicar un borrador', 'INVALID_STATE');
  }

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

// ─── Registrations (+CSV), payments and refunds ──────────────────────────

const num = (v) => (v === null || v === undefined ? null : Number(v));
const round2 = (n) => Math.round(n * 100) / 100;
const rate = (part, whole) => (whole > 0 ? round2(part / whole) : 0);

/** Flat registration rows for the admin table and the CSV. */
export async function listRegistrationsAdmin(eventId) {
  await loadEvent(eventId);
  const registrations = await eventRegRepo.findRegistrationsAdmin(eventId);
  return registrations.map((r) => ({
    id: r.id,
    name: r.user.name,
    email: r.user.email,
    phone: r.user.phoneNumber ?? null,
    career: r.user.career?.name ?? null,
    status: r.status,
    earlyBird: r.earlyBird,
    finalAmount: num(r.finalAmount),
    source: r.source ?? null,
    surveyAnswered: Boolean(r.surveyResponse),
    attended: r.surveyResponse ? r.surveyResponse.attended : null,
    marketingOptIn: Boolean(r.user.marketingOptInAt),
    registeredAt: r.createdAt,
    confirmedAt: r.confirmedAt ?? null,
    canceledAt: r.canceledAt ?? null,
    refundMethod: r.refundMethod ?? null,
    refundMethodDetails: r.refundMethodDetails ?? null,
  }));
}

const REGISTRATION_CSV_COLUMNS = [
  { key: 'name', header: 'Nombre' },
  { key: 'email', header: 'Correo' },
  { key: 'phone', header: 'Celular' },
  { key: 'career', header: 'Carrera' },
  { key: 'status', header: 'Estado' },
  { key: 'earlyBird', header: 'Descuento' },
  { key: 'finalAmount', header: 'Monto' },
  { key: 'source', header: 'Origen' },
  { key: 'surveyAnswered', header: 'Respondió encuesta' },
  { key: 'attended', header: 'Asistió' },
  { key: 'marketingOptIn', header: 'Acepta marketing' },
  { key: 'registeredAt', header: 'Inscrito el' },
  { key: 'confirmedAt', header: 'Confirmado el' },
  { key: 'canceledAt', header: 'Cancelado el' },
  { key: 'refundMethod', header: 'Método reembolso' },
  { key: 'refundMethodDetails', header: 'Datos reembolso' },
];

export function registrationsCsv(rows) {
  return toCsv(rows, REGISTRATION_CSV_COLUMNS);
}

function serializeAdminPayment(p) {
  return {
    id: p.id,
    wompiId: p.wompiId,
    reference: p.reference,
    amount: num(p.amount),
    originalAmount: num(p.originalAmount),
    discountAmount: num(p.discountAmount),
    flag: p.flag ?? null,
    refundStatus: p.refundStatus,
    refundedAt: p.refundedAt ?? null,
    createdAt: p.createdAt,
    user: { name: p.registration.user.name, email: p.registration.user.email },
    refundMethod: p.registration.refundMethod ?? null,
    refundMethodDetails: p.registration.refundMethodDetails ?? null,
  };
}

export async function getEventPaymentsAdmin(eventId) {
  await loadEvent(eventId);
  const [payments, payouts] = await Promise.all([
    eventRegRepo.findPaymentsAdmin(eventId),
    eventRepo.findTutorPayouts(eventId),
  ]);
  return { payments: payments.map(serializeAdminPayment), totals: eventPaymentTotals(payments, payouts) };
}

/** Pending to Refunded. The conditional update makes a concurrent double-click a 409. */
export async function markPaymentRefunded({ adminId, eventId, paymentId, request, now = new Date() }) {
  const payment = await eventRegRepo.findEventPayment(eventId, paymentId);
  if (!payment) throw domainError('Pago no encontrado', 'NOT_FOUND');
  const notPending = () => domainError('Solo se puede marcar como reembolsado un pago con reembolso pendiente', 'INVALID_STATE');
  if (payment.refundStatus !== 'Pending') throw notPending();

  const changed = await eventRegRepo.markPaymentRefunded(paymentId, { refundedById: adminId, now });
  if (changed === 0) throw notPending();

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.EVENT_PAYMENT_REFUNDED,
    targetType: 'EventPayment',
    targetId: paymentId,
    payload: { paymentId, eventId, amount: num(payment.amount) },
    request,
  });

  return serializeAdminPayment(await eventRegRepo.findEventPayment(eventId, paymentId));
}

// ─── Survey results ──────────────────────────────────────────────────────

export async function getSurveyResultsAdmin(eventId) {
  const event = await loadEvent(eventId);
  const [counts, stats, comments] = await Promise.all([
    eventRegRepo.surveyAggregates(eventId),
    eventRepo.reviewStatsByTutor(eventId),
    eventRepo.findReviewComments(eventId),
  ]);
  const byTutor = new Map(stats.map((s) => [s.tutorId, s]));
  const avg = (v) => (v === null || v === undefined ? null : round2(Number(v)));

  return {
    confirmedCount: counts.confirmedCount,
    responseCount: counts.responseCount,
    responseRate: rate(counts.responseCount, counts.confirmedCount),
    attendedCount: counts.attendedCount,
    attendanceRate: rate(counts.attendedCount, counts.confirmedCount),
    eventAverage: avg(counts.eventAverage),
    tutors: event.tutors.map((t) => {
      const stat = byTutor.get(t.tutorId);
      return { tutorId: t.tutorId, name: t.tutor.name, average: avg(stat?._avg.rating), count: stat?._count.id ?? 0 };
    }),
    comments: comments
      .filter((c) => c.comment?.trim())
      .map((c) => ({ tutorName: c.tutor.name, rating: c.rating, comment: c.comment })),
  };
}

// ─── Tutor payouts ───────────────────────────────────────────────────────

function serializePayout(p) {
  return {
    id: p.id,
    eventId: p.eventId,
    tutorId: p.tutorId,
    tutorName: p.tutor?.name ?? null,
    amount: num(p.amount),
    paidAt: p.paidAt,
    note: p.note ?? null,
    createdAt: p.createdAt,
  };
}

export async function listTutorPayouts(eventId) {
  await loadEvent(eventId);
  return (await eventRepo.findTutorPayouts(eventId)).map(serializePayout);
}

export async function createTutorPayout({ adminId, eventId, tutorId, amount, paidAt, note, request }) {
  const event = await loadEvent(eventId);
  if (!event.tutors.some((t) => t.tutorId === tutorId)) {
    throw domainError('El tutor no pertenece a este evento', 'VALIDATION_ERROR', { rule: 'NOT_EVENT_TUTOR', field: 'tutorId' });
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    throw domainError('El monto debe ser un entero mayor a 0', 'VALIDATION_ERROR', { rule: 'INVALID_AMOUNT', field: 'amount' });
  }

  const payout = await eventRepo.createTutorPayout({
    eventId,
    tutorId,
    amount,
    paidAt: new Date(paidAt),
    note: trimOrNull(note),
    createdById: adminId,
  });

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.EVENT_TUTOR_PAYOUT,
    targetType: 'Event',
    targetId: eventId,
    payload: { eventId, tutorId, amount, payoutId: payout.id },
    request,
  });

  return serializePayout(payout);
}
