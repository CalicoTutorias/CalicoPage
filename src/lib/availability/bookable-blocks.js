/**
 * Reglas compartidas sobre los bloques de la tabla `availabilities`.
 *
 * Única fuente de verdad para dos preguntas que se hacían (y se contestaban
 * distinto) en varios sitios: la reserva, la disponibilidad conjunta, el
 * semáforo del panel admin y la cuadrícula del tutor.
 *
 *  1. ¿Qué bloques cuentan como disponibilidad publicada (reservable)?
 *     - Modo «eventos = disponible» (por defecto): todos los bloques, sean
 *       manuales o sincronizados desde Google Calendar.
 *     - Modo «eventos = ocupado»: los bloques manuales son solo la BASE
 *       (horas de trabajo). Lo que se publica son los bloques `calendar_sync`
 *       que la sincronización deriva de esa base restando los eventos de
 *       Google. Si la base se publicara también, la resta no serviría de nada.
 *
 *  2. ¿A qué fecha aplica un bloque? Los recurrentes se repiten cada semana en
 *     su `dayOfWeek`; los de una sola vez solo valen en su `specificDate`.
 *
 * Módulo puro (sin Prisma ni fetch) para poder importarlo tanto desde el
 * servidor como desde componentes de cliente.
 */

export const CALENDAR_SYNC_MODE_AVAILABLE = 'available';
export const CALENDAR_SYNC_MODE_BUSY = 'busy';

export const AVAILABILITY_SOURCE_MANUAL = 'manual';
export const AVAILABILITY_SOURCE_CALENDAR_SYNC = 'calendar_sync';

/**
 * @param {{ calendarSyncMode?: string|null }|null|undefined} schedule
 * @returns {boolean}
 */
export function isBusySyncMode(schedule) {
  return schedule?.calendarSyncMode === CALENDAR_SYNC_MODE_BUSY;
}

/** Fuente efectiva de un bloque; las filas anteriores a la columna cuentan como manuales. */
export function getBlockSource(block) {
  return block?.source ?? AVAILABILITY_SOURCE_MANUAL;
}

/**
 * En modo «ocupado», un bloque manual es la base de la que se deriva la
 * disponibilidad real; no se publica por sí mismo.
 */
export function isBaseBlock(block, schedule) {
  return isBusySyncMode(schedule) && getBlockSource(block) === AVAILABILITY_SOURCE_MANUAL;
}

/**
 * Filtra los bloques que cuentan como disponibilidad publicada para el tutor.
 *
 * @template T
 * @param {T[]} blocks
 * @param {{ calendarSyncMode?: string|null }|null|undefined} schedule
 * @returns {T[]}
 */
export function selectBookableBlocks(blocks, schedule) {
  const list = Array.isArray(blocks) ? blocks : [];
  if (!isBusySyncMode(schedule)) return list;
  return list.filter((block) => !isBaseBlock(block, schedule));
}

/**
 * "YYYY-MM-DD" de un `specificDate`, venga como Date (medianoche UTC, que es
 * como Prisma devuelve un `@db.Date`) o como string ISO.
 * @returns {string|null}
 */
export function specificDateToIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.substring(0, 10);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().substring(0, 10);
}

/**
 * ¿Aplica este bloque a la fecha dada?
 *
 * @param {{ recurring?: boolean, dayOfWeek: number, specificDate?: Date|string|null }} block
 * @param {string} isoDate  "YYYY-MM-DD" de la fecha (en la zona horaria del tutor)
 * @param {number} dayOfWeek 0 (domingo) – 6 (sábado) de esa misma fecha
 * @returns {boolean}
 */
export function blockAppliesToDate(block, isoDate, dayOfWeek) {
  if (!block) return false;
  // Filas anteriores a la columna `recurring` son semanales.
  const recurring = block.recurring !== false;
  if (recurring) return block.dayOfWeek === dayOfWeek;
  return specificDateToIso(block.specificDate) === isoDate;
}
