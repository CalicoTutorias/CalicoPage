/**
 * Configuración centralizada de los umbrales de disponibilidad de tutores.
 *
 * Se usa en el panel de administración para clasificar a cada tutor activo
 * según cuántas horas libres tiene en la ventana móvil de los próximos días.
 * No son secretos: tienen valor por defecto y la app arranca sin ellos.
 *
 * Uso:
 *   import { MIN_HOURS_THRESHOLD } from '@/config/availability';
 */

/**
 * Lee una variable de entorno numérica y positiva.
 * Si falta, no es un número o es <= 0, cae al valor por defecto (con un aviso
 * en desarrollo) en vez de propagar un NaN que rompería las comparaciones.
 *
 * @param {string} key
 * @param {number} fallback
 * @returns {number}
 */
function readPositiveNumber(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[config/availability] ${key}="${raw}" no es un número positivo; usando ${fallback}.`);
    }
    return fallback;
  }

  return value;
}

/** Tamaño de la ventana móvil, en días, contada desde NOW(). */
export const AVAILABILITY_WINDOW_DAYS = readPositiveNumber('AVAILABILITY_WINDOW_DAYS', 7);

/**
 * Horas libres mínimas dentro de la ventana para que un tutor se considere
 * con buena disponibilidad (verde). Por debajo es amarillo; cero es rojo.
 */
export const MIN_HOURS_THRESHOLD = readPositiveNumber('MIN_HOURS_THRESHOLD', 10);

/**
 * Días tras los cuales una sincronización se considera rancia. Un calendario
 * sincronizado hace un mes describe bloques que ya no reflejan la realidad, así
 * que el tutor vuelve a contarse como "no conectado" (gris).
 */
export const CALENDAR_SYNC_STALE_DAYS = readPositiveNumber('CALENDAR_SYNC_STALE_DAYS', 14);

/** Zona horaria por defecto cuando el tutor no tiene `Schedule`. */
export const DEFAULT_TIMEZONE = 'America/Bogota';
