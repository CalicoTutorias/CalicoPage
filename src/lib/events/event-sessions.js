/**
 * Repaso dividido en varios días (`events.sessions`). Puro y client-safe: lo
 * usan el formulario del admin, las reglas del API y las vistas del repaso.
 *
 * Cada sesión es { startsAt, endsAt, durationHours } (ISO UTC). Con hora por
 * confirmar (event.timeTbc) cada sesión ocupa su día completo en Bogotá
 * (00:00–23:59) y durationHours dice cuánto durará; si no, durationHours es
 * null y vale el rango. Un repaso de una sola sesión guarda sessions = null.
 *
 * El evento conserva startsAt = inicio de la primera sesión y endsAt = fin de
 * la última, así que listados, cierre de inscripciones, "finalizado",
 * encuesta y materiales siguen leyendo esas dos columnas sin cambios.
 */

import { utcToBogotaLocalInput } from '../utils/event-format';

export const EVENT_MIN_SESSIONS = 2;
export const EVENT_MAX_SESSIONS = 10;
export const EVENT_MAX_SESSION_HOURS = 12;

const toIsoOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/**
 * Lista canónica (ISO, ordenada por inicio, duración solo con hora por
 * confirmar) o null cuando no hay sesiones. Las fechas inválidas quedan en
 * null para que validateSessions las rechace.
 */
export function normalizeSessions(sessions, timeTbc) {
  if (!Array.isArray(sessions) || sessions.length === 0) return null;
  return sessions
    .map((s) => {
      const hours = s?.durationHours;
      return {
        startsAt: toIsoOrNull(s?.startsAt),
        endsAt: toIsoOrNull(s?.endsAt),
        durationHours: timeTbc && hours !== null && hours !== undefined && hours !== '' ? Number(hours) : null,
      };
    })
    .sort((a, b) => (a.startsAt ?? '￿').localeCompare(b.startsAt ?? '￿'));
}

/** Sesiones de un evento leído (API o BD), o null si es de una sola sesión. */
export function eventSessionsOf(event) {
  const list = event?.sessions;
  return Array.isArray(list) && list.length >= EVENT_MIN_SESSIONS ? list : null;
}

/** Inicio de la primera sesión y fin de la última (listas ya normalizadas). */
export function sessionsEnvelope(sessions) {
  return { startsAt: sessions[0].startsAt, endsAt: sessions[sessions.length - 1].endsAt };
}

const bogotaDay = (iso) => utcToBogotaLocalInput(iso).slice(0, 10);

/**
 * Reglas de una lista normalizada.
 * @returns {{ code: string, field: 'sessions', index?: number } | null}
 */
export function validateSessions(sessions, timeTbc) {
  const problem = (code, index) => ({ code, field: 'sessions', ...(index !== undefined ? { index } : {}) });
  if (!Array.isArray(sessions) || sessions.length < EVENT_MIN_SESSIONS || sessions.length > EVENT_MAX_SESSIONS) {
    return problem('SESSIONS_COUNT_INVALID');
  }
  for (let i = 0; i < sessions.length; i += 1) {
    const s = sessions[i];
    if (!s.startsAt || !s.endsAt) return problem('SESSION_INVALID_DATES', i);
    const ms = new Date(s.endsAt) - new Date(s.startsAt);
    if (ms <= 0) return problem('SESSION_ENDS_BEFORE_START', i);
    if (timeTbc) {
      const hours = Number(s.durationHours);
      if (!(hours > 0) || hours > EVENT_MAX_SESSION_HOURS) return problem('SESSION_DURATION_INVALID', i);
    } else if (ms > EVENT_MAX_SESSION_HOURS * 3_600_000) {
      return problem('SESSION_TOO_LONG', i);
    }
    if (i > 0) {
      const prev = sessions[i - 1];
      if (bogotaDay(prev.startsAt) === bogotaDay(s.startsAt)) return problem('SESSIONS_SAME_DAY', i);
      if (new Date(s.startsAt) < new Date(prev.endsAt)) return problem('SESSIONS_OVERLAP', i);
    }
  }
  return null;
}

/** Horas de una sesión: su duración (hora por confirmar) o su rango. */
export function sessionHours(session) {
  if (session.durationHours != null) return Number(session.durationHours) || 0;
  const ms = new Date(session.endsAt) - new Date(session.startsAt);
  return Number.isFinite(ms) && ms > 0 ? ms / 3_600_000 : 0;
}

/** Suma de las horas de todas las sesiones. */
export function sessionsTotalHours(sessions) {
  return sessions.reduce((acc, s) => acc + sessionHours(s), 0);
}
