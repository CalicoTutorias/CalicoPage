/**
 * Helpers de zona horaria para los bloques de disponibilidad.
 *
 * Los bloques guardan una hora de pared local (`TIME`) y un `dayOfWeek` local,
 * así que hay que resolverlos contra la zona del tutor, no contra la del
 * servidor. Se usa Intl para no añadir una dependencia de fechas.
 *
 * Módulo puro (sin Prisma ni fetch).
 */

const MS_PER_MINUTE = 60_000;

/**
 * Desfase de una zona horaria respecto a UTC, en ms, en un instante concreto.
 * @param {Date} date
 * @param {string} timeZone
 * @returns {number}
 */
// Construir un `Intl.DateTimeFormat` es de lo más caro de V8 (decenas de µs)
// y esta función se llama varias veces por bloque y por día de la ventana para
// cada tutor candidato: miles de veces por request. El formatter es inmutable,
// así que se cachea uno por zona horaria (en la práctica, una sola).
const OFFSET_FORMATTERS = new Map();

function getOffsetFormatter(timeZone) {
  let formatter = OFFSET_FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    OFFSET_FORMATTERS.set(timeZone, formatter);
  }
  return formatter;
}

export function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getOffsetFormatter(timeZone)
    .formatToParts(date)
    .reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24, // algunas locales devuelven "24" para medianoche
    Number(parts.minute),
    Number(parts.second),
  );

  return asUtc - date.getTime();
}

/**
 * Partes del calendario local (año/mes/día/día de la semana) de un instante.
 * @param {Date} date
 * @param {string} timeZone
 */
export function getZonedDateParts(date, timeZone) {
  const shifted = new Date(date.getTime() + getTimeZoneOffsetMs(date, timeZone));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay(),
  };
}

/**
 * Convierte una hora de pared local (fecha + minutos desde medianoche) al
 * instante UTC correspondiente. Se recalcula el desfase una segunda vez para
 * quedar del lado correcto de un cambio de horario de verano.
 *
 * @returns {number} timestamp en ms
 */
export function zonedWallTimeToTimestamp(year, month, day, minutes, timeZone) {
  const asIfUtc = Date.UTC(year, month - 1, day) + minutes * MS_PER_MINUTE;

  const firstOffset = getTimeZoneOffsetMs(new Date(asIfUtc), timeZone);
  const firstGuess = asIfUtc - firstOffset;

  const secondOffset = getTimeZoneOffsetMs(new Date(firstGuess), timeZone);
  return secondOffset === firstOffset ? firstGuess : asIfUtc - secondOffset;
}

/** Minutos desde medianoche de un `TIME` de Prisma (guardado como 1970-01-01THH:MM:SSZ). */
export function timeToMinutes(value) {
  if (value instanceof Date) {
    return value.getUTCHours() * 60 + value.getUTCMinutes();
  }
  const [h, m] = String(value).split(':');
  return Number(h) * 60 + Number(m);
}
