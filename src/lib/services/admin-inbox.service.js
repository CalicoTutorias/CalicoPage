/**
 * Bandeja «Requiere acción» del Inicio de admin
 * (docs/admin/ADMIN-REORG-FUNCTIONAL.md §4.1).
 *
 * Una sola llamada devuelve las 8 colas con su contador, el pendiente más
 * antiguo y la prioridad (`severity`) calculada aquí, en el servidor. Cada
 * cola se resuelve por separado: si una fuente falla, solo esa tarjeta sale
 * con `ok: false` y el resto carga.
 *
 * Sin caché: el contador tiene que bajar apenas el admin aprueba algo.
 */

import * as inboxRepo from '../repositories/admin-inbox.repository';
import * as adminSessionsService from './admin-sessions.service';
import * as payoutsService from './payouts.service';
import * as courseNotifyService from './course-notify.service';
import {
  PAYOUT_CUTOFF_WEEKDAY,
  EVENT_APPROVAL_URGENT_DAYS,
  PENDING_SOON_HOURS,
  RECRUITMENT_TOP_N,
  INBOX_SLA_HOURS,
} from '../../config/admin-inbox';

const HOUR_MS = 60 * 60 * 1000;
const BOGOTA_OFFSET_MS = -5 * HOUR_MS; // Colombia no tiene horario de verano

/** Orden de las tarjetas en el Inicio (por prioridad base). */
export const INBOX_KEYS = [
  'unbooked',
  'applications',
  'recruitment',
  'eventApprovals',
  'payouts',
  'courseRequests',
  'suggestions',
  'pendingSoon',
];

/** Día de la semana (0 = domingo) en hora de Bogotá. */
export function bogotaWeekday(now) {
  return new Date(now.getTime() + BOGOTA_OFFSET_MS).getUTCDay();
}

function isOverdue(key, oldestAt, now) {
  const sla = INBOX_SLA_HOURS[key];
  if (!sla || !oldestAt) return false;
  return now.getTime() - new Date(oldestAt).getTime() > sla * HOUR_MS;
}

function minDate(values) {
  const times = values.filter(Boolean).map((v) => new Date(v).getTime());
  return times.length ? new Date(Math.min(...times)) : null;
}

/**
 * Cada loader devuelve `{ count, oldestAt?, severity, ...detalle }`.
 * `severity` ∈ critical | high | medium | info | ok (ok = cola vacía).
 */
const LOADERS = {
  async unbooked() {
    const items = await adminSessionsService.listUnbookedPayments();
    return {
      count: items.length,
      oldestAt: minDate(items.map((i) => i.createdAt)),
      severity: items.length ? 'critical' : 'ok',
    };
  },

  async applications() {
    const { count, oldestAt } = await inboxRepo.pendingApplicationsSummary();
    return { count, oldestAt, severity: count ? 'high' : 'ok' };
  },

  async recruitment() {
    const demand = await courseNotifyService.getRecruitmentDemand();
    const uncovered = demand.filter((d) => d.needsTutor);
    return {
      count: uncovered.length,
      waitingStudents: uncovered.reduce((sum, d) => sum + d.waiting, 0),
      oldestAt: minDate(uncovered.map((d) => d.oldestAt)),
      top: uncovered.slice(0, RECRUITMENT_TOP_N),
      severity: uncovered.length ? 'high' : 'ok',
    };
  },

  async eventApprovals(now) {
    const events = await inboxRepo.pendingEventApprovalsByEvent({ now });
    const count = events.reduce((sum, e) => sum + e.count, 0);
    const next = events[0] ?? null;
    const urgentUntil = now.getTime() + EVENT_APPROVAL_URGENT_DAYS * 24 * HOUR_MS;
    const urgent = events.some((e) => e.startsAt && new Date(e.startsAt).getTime() <= urgentUntil);
    return {
      count,
      eventsCount: events.length,
      oldestAt: minDate(events.map((e) => e.oldestAt)),
      nextEvent: next && { id: next.eventId, title: next.title, startsAt: next.startsAt, count: next.count },
      severity: !count ? 'ok' : urgent ? 'high' : 'medium',
    };
  },

  async payouts(now) {
    const { totals } = await payoutsService.listPendingPayoutsByTutor();
    const count = totals.tutorsCount;
    const cutoffToday = bogotaWeekday(now) === PAYOUT_CUTOFF_WEEKDAY;
    return {
      count,
      amountOwed: totals.tutorOwed,
      paymentsCount: totals.paymentsCount,
      cutoffWeekday: PAYOUT_CUTOFF_WEEKDAY,
      cutoffToday,
      severity: !count ? 'ok' : cutoffToday ? 'high' : 'medium',
    };
  },

  async courseRequests() {
    const count = await inboxRepo.pendingCourseRequestsCount();
    return { count, oldestAt: null, severity: count ? 'medium' : 'ok' };
  },

  async suggestions() {
    const { count, oldestAt } = await inboxRepo.pendingSuggestionsSummary();
    return { count, oldestAt, severity: count ? 'medium' : 'ok' };
  },

  async pendingSoon(now) {
    const { count, nextAt } = await inboxRepo.pendingSessionsStartingSoon({ now, hours: PENDING_SOON_HOURS });
    return { count, nextAt, windowHours: PENDING_SOON_HOURS, severity: count ? 'medium' : 'ok' };
  },
};

/**
 * @returns {Promise<{ generatedAt: string, items: Array<{ key: string, ok: boolean, overdue?: boolean }> }>}
 */
export async function getInbox({ now = new Date() } = {}) {
  const settled = await Promise.allSettled(INBOX_KEYS.map((key) => LOADERS[key](now)));

  const items = settled.map((result, i) => {
    const key = INBOX_KEYS[i];
    if (result.status === 'rejected') {
      console.error(`[admin-inbox] ${key} failed:`, result.reason?.message ?? result.reason);
      return { key, ok: false };
    }
    const value = result.value;
    return { key, ok: true, ...value, overdue: value.count > 0 && isOverdue(key, value.oldestAt, now) };
  });

  return { generatedAt: now.toISOString(), items };
}
