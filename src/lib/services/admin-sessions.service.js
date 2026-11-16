/**
 * Admin "Tutorías" operations page (/home/admin/tutorias): every session
 * with what the team needs to act on it, its CSV export, and the payments
 * that took money but booked nothing.
 *
 * Unlike the dashboard history (admin-metrics.service) this is not a
 * metric: test-course sessions can be included, rows carry contact emails
 * and the Meet link, and nothing is cached.
 */

import * as metricsRepo from '../repositories/admin-metrics.repository';
import * as paymentIntentRepo from '../repositories/payment-intent.repository';
import { METRICS_EXCLUDED_COURSE_CODES } from '../repositories/metrics-exclusions';
import { paymentStatusOf } from './admin-metrics.service';
import { frozenAmountCop, intentKind } from '../payments/checkout';
import { bogotaLocalToUtc, utcToBogotaLocalInput } from '../utils/event-format';
import { toCsv } from '../utils/csv';

export const SESSIONS_PAGE_MAX = 100;
export const SESSIONS_EXPORT_MAX_ROWS = 5000;
/** A pinned pending transaction gets this long to be settled by the webhook before it is listed. */
export const UNBOOKED_PENDING_AFTER_MINUTES = 15;
const UNBOOKED_MAX_ROWS = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Sessions ───────────────────────────────────────────────────────────

/**
 * Route filters → repository filters. `from` / `to` are whole Bogotá days
 * ("YYYY-MM-DD"), both inclusive: `to` becomes the next Bogotá midnight,
 * used as an exclusive bound.
 */
function toRepoFilters({
  statuses = [], from = null, to = null, search = '', upcoming = false, missingMeet = false, includeTest = false,
} = {}) {
  return {
    statuses,
    from: from ? bogotaLocalToUtc(`${from}T00:00`) : null,
    to:   to ? new Date(bogotaLocalToUtc(`${to}T00:00`).getTime() + DAY_MS) : null,
    search,
    upcoming,
    missingMeet,
    includeTest,
  };
}

/** 'tutor' | 'student' | 'other' (an admin, a job…) | null when unknown. */
function cancelledByRole(row) {
  if (!row.cancelledBy) return null;
  if (row.cancelledBy === row.tutor?.id) return 'tutor';
  if (row.students.some((u) => u.id === row.cancelledBy)) return 'student';
  return 'other';
}

function toOperationsItem(row) {
  const paymentStatus = paymentStatusOf(row.payments);
  const shown = row.payments.filter((p) => p.status === paymentStatus);
  return {
    id:             row.id,
    status:         row.status,
    source:         row.source,
    startTimestamp: row.startTimestamp,
    endTimestamp:   row.endTimestamp,
    createdAt:      row.createdAt,
    course:         row.course,
    isTest:         METRICS_EXCLUDED_COURSE_CODES.includes(row.course?.code),
    tutor:          row.tutor,
    students:       row.students.map((u) => ({
      id:       u.id,
      name:     u.name,
      email:    u.email,
      external: u.kind === 'ExternalTemporary',
    })),
    meetLink:    row.googleMeetLink || null,
    missingMeet: row.status === 'Accepted' && !row.googleMeetLink,
    payment: {
      status:   paymentStatus,
      amount:   paymentStatus === 'none' ? null : shown.reduce((sum, p) => sum + p.amount, 0),
      viaWompi: shown.some((p) => p.viaWompi),
    },
    cancellation: row.status === 'Canceled'
      ? { at: row.cancelledAt, reason: row.cancellationReason || null, by: cancelledByRole(row) }
      : null,
  };
}

/**
 * One page of the operations listing.
 * @param {{ statuses?: string[], from?: string|null, to?: string|null, search?: string,
 *   upcoming?: boolean, missingMeet?: boolean, includeTest?: boolean,
 *   limit?: number, offset?: number }} query — validated by the route
 */
export async function listSessions({ limit = 25, offset = 0, ...filters } = {}, now = new Date()) {
  const l = Math.max(1, Math.min(limit, SESSIONS_PAGE_MAX));
  const o = Math.max(0, offset);
  const { rows, total } = await metricsRepo.operationsSessions({
    filters: toRepoFilters(filters), now, limit: l, offset: o,
  });
  return { items: rows.map(toOperationsItem), total, limit: l, offset: o };
}

// CSV cells for Bogotá admins, like the event registrations export:
// timestamps as Bogotá local "YYYY-MM-DD HH:mm", booleans as Sí/No.
const yesNo = (v) => (v ? 'Sí' : 'No');
const bogotaTime = (d) => (d ? utcToBogotaLocalInput(d).replace('T', ' ') : null);
const CANCELLED_BY_CSV = { tutor: 'Tutor', student: 'Estudiante', other: 'Otro' };

const SESSION_CSV_COLUMNS = [
  { key: 'id',                 header: 'ID' },
  { key: 'start',              header: 'Inicio' },
  { key: 'end',                header: 'Fin' },
  { key: 'status',             header: 'Estado' },
  { key: 'source',             header: 'Origen' },
  { key: 'courseCode',         header: 'Código materia' },
  { key: 'courseName',         header: 'Materia' },
  { key: 'tutorName',          header: 'Tutor' },
  { key: 'tutorEmail',         header: 'Correo tutor' },
  { key: 'studentNames',       header: 'Estudiantes' },
  { key: 'studentEmails',      header: 'Correos estudiantes' },
  { key: 'paymentStatus',      header: 'Estado pago' },
  { key: 'amount',             header: 'Monto' },
  { key: 'viaWompi',           header: 'Vía Wompi' },
  { key: 'meetLink',           header: 'Link Meet' },
  { key: 'createdAt',          header: 'Creada' },
  { key: 'cancelledAt',        header: 'Cancelada el' },
  { key: 'cancellationReason', header: 'Motivo cancelación' },
  { key: 'cancelledBy',        header: 'Cancelada por' },
  { key: 'isTest',             header: 'Prueba' },
];

function toCsvRow(item) {
  return {
    id:                 item.id,
    start:              bogotaTime(item.startTimestamp),
    end:                bogotaTime(item.endTimestamp),
    status:             item.status,
    source:             item.source,
    courseCode:         item.course?.code,
    courseName:         item.course?.name,
    tutorName:          item.tutor?.name,
    tutorEmail:         item.tutor?.email,
    studentNames:       item.students.map((u) => u.name).join('; '),
    studentEmails:      item.students.map((u) => u.email).join('; '),
    paymentStatus:      item.payment.status,
    amount:             item.payment.amount,
    viaWompi:           yesNo(item.payment.viaWompi),
    meetLink:           item.meetLink,
    createdAt:          bogotaTime(item.createdAt),
    cancelledAt:        bogotaTime(item.cancellation?.at),
    cancellationReason: item.cancellation?.reason,
    cancelledBy:        CANCELLED_BY_CSV[item.cancellation?.by] ?? null,
    isTest:             yesNo(item.isTest),
  };
}

/** CSV of the listing under the same filters, first SESSIONS_EXPORT_MAX_ROWS rows. */
export async function sessionsCsv(filters = {}, now = new Date()) {
  const { rows } = await metricsRepo.operationsSessions({
    filters: toRepoFilters(filters), now, limit: SESSIONS_EXPORT_MAX_ROWS, offset: 0,
  });
  return toCsv(rows.map(toOperationsItem).map(toCsvRow), SESSION_CSV_COLUMNS);
}

// ─── Payments without a booking ─────────────────────────────────────────

const str = (v) => (v === null || v === undefined || v === '' ? null : String(v));

/**
 * The payments sweeper's last verdict, stored on the intent as
 * `metadata.sweep = { status, transactionId, outcome, reason, checkedAt }`.
 * `status` is null when Wompi could not be asked at all (outcome ERROR).
 * NEEDS_ATTENTION is final for the sweeper: only a reconcile or a refund
 * gets the intent out of this list.
 */
function sweepOf(metadata) {
  const s = metadata.sweep;
  if (!s || typeof s !== 'object') return null;
  return {
    status:    str(s.status),
    outcome:   str(s.outcome),
    reason:    str(s.reason),
    checkedAt: str(s.checkedAt),
  };
}

function toUnbookedItem(row) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const kind = intentKind({ kind: row.kind, metadata });
  return {
    reference: row.reference,
    kind,
    createdAt: row.created_at,
    student:   { name: row.student_name ?? null, email: row.student_email ?? null },
    tutor:     row.tutor_name ? { name: row.tutor_name } : null,
    course:    row.course_code ? { code: row.course_code, name: row.course_name } : null,
    event:     row.event_title ? { title: row.event_title } : null,
    slotStart: kind === 'event' ? row.event_starts_at ?? null : str(metadata.startTimestamp),
    amount:    frozenAmountCop({ kind, metadata }),
    // The sweeper's id first (it looked the transaction up), then the one
    // confirm-payment pinned. The reconcile route accepts either.
    transactionId: str(metadata.sweep?.transactionId) ?? str(metadata.pendingTransactionId),
    sweep:     sweepOf(metadata),
  };
}

/** Unconsumed intents that took money (or may have) without a booking. */
export async function listUnbookedPayments() {
  const rows = await paymentIntentRepo.findUnbooked({
    pendingAfterMinutes: UNBOOKED_PENDING_AFTER_MINUTES,
    limit: UNBOOKED_MAX_ROWS,
  });
  return rows.map(toUnbookedItem);
}
