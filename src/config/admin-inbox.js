/**
 * Reglas de la bandeja «Requiere acción» del Inicio de admin
 * (docs/admin/ADMIN-REORG-FUNCTIONAL.md §4.1). No son secretos.
 */

/**
 * Día de corte del pago semanal a tutores (0 = domingo … 6 = sábado, hora de
 * Bogotá). Ese día la tarjeta «Pagos a tutores adeudados» sube a prioridad
 * alta. Configurable con PAYOUT_CUTOFF_WEEKDAY; por defecto viernes.
 */
function readWeekday(raw, fallback) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : fallback;
}

export const PAYOUT_CUTOFF_WEEKDAY = readWeekday(process.env.PAYOUT_CUTOFF_WEEKDAY, 5);

/** Un evento con inscripciones por aprobar a ≤ N días pasa a prioridad alta. */
export const EVENT_APPROVAL_URGENT_DAYS = 3;

/** Ventana de «tutorías próximas todavía en Pending». */
export const PENDING_SOON_HOURS = 24;

/** Cuántas materias sin tutor se muestran en la tarjeta de reclutamiento. */
export const RECRUITMENT_TOP_N = 5;

/**
 * Plazo objetivo (horas) por cola: si el pendiente más antiguo lo supera, la
 * tarjeta marca `overdue`. null = la cola no tiene plazo de resolución.
 */
export const INBOX_SLA_HOURS = {
  unbooked: 24,
  applications: 48,
  recruitment: null,
  eventApprovals: null,
  payouts: null,
  courseRequests: null, // tutor_courses no guarda fecha de solicitud
  suggestions: 7 * 24,
  pendingSoon: null,
};
