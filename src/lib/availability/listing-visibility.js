/**
 * Regla única de "¿este tutor aparece en las búsquedas de los estudiantes?".
 *
 * Un tutor aprobado y activo solo se lista si tiene al menos
 * `MIN_LISTING_HOURS` horas LIBRES en la ventana móvil de los próximos
 * `AVAILABILITY_WINDOW_DAYS` días. "Libres" = bloques publicados menos
 * sesiones ya reservadas, igual que calcula el semáforo del panel admin.
 * Con menos de ese mínimo (o cero) no tiene sentido mostrarlo: no habría
 * nada que reservarle.
 *
 * Como las horas libres dependen de la zona horaria del tutor y de restar
 * sesiones, no se pueden expresar en un `where` de Prisma. La regla se aplica
 * en dos pasos:
 *
 *   1. `listingCandidateWhere()` — pre-filtro barato EN LA BASE DE DATOS:
 *      aprobado + activo + al menos un bloque publicado reservable a futuro
 *      (semanal, o de fecha ≥ hoy; en modo «eventos = ocupado» solo cuentan
 *      los `calendar_sync`). Descarta de entrada a quien no tiene horario.
 *   2. `deriveIsListed()` — veredicto final con las horas libres que calcula
 *      `tutor-availability-status.service.js` (campo `isListed`). Lo aplica
 *      `tutor-listing.service.js` sobre los candidatos del paso 1.
 *
 * Módulo sin Prisma ni fetch: importable desde repositorios, servicios y
 * componentes de cliente.
 */

import {
  AVAILABILITY_SOURCE_CALENDAR_SYNC,
  CALENDAR_SYNC_MODE_BUSY,
  selectBookableBlocks,
} from './bookable-blocks';
import { DEFAULT_TIMEZONE } from '../../config/availability';

/**
 * "Hoy" como `Date` a medianoche UTC del día civil en la zona de Calico. Es el
 * formato en que Prisma guarda un `@db.Date`, así que sirve para comparar con
 * `specific_date` sin desfases de zona horaria del servidor.
 *
 * @param {Date} [now]
 * @param {string} [timeZone]
 * @returns {Date}
 */
export function startOfTodayAsDbDate(now = new Date(), timeZone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(now)
    .reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
}

/**
 * Fragmento `where` de Prisma sobre `Availability`: bloques que aún pueden
 * reservarse (semanales o de una fecha que no ha pasado).
 *
 * @param {Date} [today] — de `startOfTodayAsDbDate()`
 */
export function futureAvailabilityWhere(today = startOfTodayAsDbDate()) {
  return {
    OR: [
      { recurring: true },
      { specificDate: { gte: today } },
    ],
  };
}

/**
 * Fragmento `where` de Prisma sobre `User`: CANDIDATOS a aparecer (paso 1).
 * Aprobados, activos y con disponibilidad publicada a futuro. El veredicto
 * final lo da `deriveIsListed` con las horas libres. Nunca se usa en el panel
 * de administración, que debe ver a todos los tutores (precisamente para
 * poder avisar a los que no aparecen).
 *
 * @param {Date} [today]
 */
export function listingCandidateWhere(today = startOfTodayAsDbDate()) {
  const future = futureAvailabilityWhere(today);

  return {
    isTutorApproved: true,
    isActive: true,
    OR: [
      // Modo «eventos = disponible» (o sin schedule): cualquier bloque futuro.
      {
        schedule: null,
        availabilities: { some: future },
      },
      {
        schedule: { calendarSyncMode: null },
        availabilities: { some: future },
      },
      {
        schedule: { calendarSyncMode: { not: CALENDAR_SYNC_MODE_BUSY } },
        availabilities: { some: future },
      },
      // Modo «eventos = ocupado»: solo publican los bloques derivados de Google.
      {
        schedule: { calendarSyncMode: CALENDAR_SYNC_MODE_BUSY },
        availabilities: { some: { ...future, source: AVAILABILITY_SOURCE_CALENDAR_SYNC } },
      },
    ],
  };
}

/**
 * Paso 1 en JS: ¿hay algún bloque publicado entre los bloques futuros?
 *
 * @param {Array<{ source?: string|null }>} futureBlocks — ya filtrados con
 *   `futureAvailabilityWhere` (o equivalente)
 * @param {{ calendarSyncMode?: string|null }|null|undefined} schedule
 * @returns {boolean}
 */
export function hasBookableFutureBlocks(futureBlocks, schedule) {
  return selectBookableBlocks(futureBlocks ?? [], schedule).length > 0;
}

/**
 * Paso 2, función pura: ¿aparece en las búsquedas?
 *
 * Se compara en MINUTOS enteros (como el semáforo) para evitar que un tutor
 * con exactamente el mínimo caiga del lado equivocado por redondeo.
 *
 * @param {{ hasBookableBlocks: boolean, minutes: number, minListingMinutes: number }} input
 * @returns {boolean}
 */
export function deriveIsListed({ hasBookableBlocks, minutes, minListingMinutes }) {
  if (!hasBookableBlocks) return false;
  return minutes >= minListingMinutes;
}

/**
 * ¿El semáforo dice que el tutor NO aparece? Centraliza la lectura del campo
 * para que la UI no repita `=== false` por todas partes.
 *
 * @param {{ isListed?: boolean }|null|undefined} availability
 * @returns {boolean}
 */
export function isHiddenFromStudents(availability) {
  return availability?.isListed === false;
}
