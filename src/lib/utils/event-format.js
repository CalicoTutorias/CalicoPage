/**
 * Bogotá time helpers for events (client- and server-safe). Colombia has no
 * DST: America/Bogota is a fixed UTC−05:00, so wall-clock ↔ UTC is a constant
 * offset. Admin inputs are Bogotá wall-clock ("YYYY-MM-DDTHH:mm"); everything
 * stored is UTC; everything shown is Bogotá.
 */

export const EVENT_TIME_ZONE = 'America/Bogota';
const BOGOTA_OFFSET = '-05:00';
const LOCAL_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const intlLocale = (locale) => (locale === 'en' ? 'en-US' : 'es-CO');

export function bogotaLocalToUtc(local) {
  if (typeof local !== 'string' || !LOCAL_INPUT_RE.test(local)) {
    throw new Error(`Invalid Bogotá local datetime: ${local}`);
  }
  const date = new Date(`${local}:00${BOGOTA_OFFSET}`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid Bogotá local datetime: ${local}`);
  return date;
}

export function utcToBogotaLocalInput(date) {
  const d = date instanceof Date ? date : new Date(date);
  const shifted = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
}

export function formatEventDate(date, locale = 'es') {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: EVENT_TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date(date));
}

export function formatEventTimeRange(start, end, locale = 'es') {
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: EVENT_TIME_ZONE, hour: 'numeric', minute: '2-digit',
  });
  return `${fmt.format(new Date(start))} – ${fmt.format(new Date(end))}`;
}

export function joinNames(names = [], locale = 'es') {
  const list = names.filter(Boolean);
  const and = locale === 'en' ? 'and' : 'y';
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} ${and} ${list[list.length - 1]}`;
}
