/**
 * Tutor Listing Service
 *
 * Aplica el paso 2 de la regla de visibilidad (`listing-visibility.js`):
 * de un conjunto de tutores candidatos (ya pre-filtrados en BD con
 * `listingCandidateWhere`), deja solo los que tienen al menos
 * `MIN_LISTING_HOURS` horas libres en la ventana móvil, según el semáforo
 * (`tutor-availability-status.service`, 5 consultas en bloque, sin N+1).
 *
 * Lo consumen:
 *   - `user.service.getAllTutors` / `getTutorsByCourse` → `/api/users/tutors`
 *   - `academic.service` → `availableTutorCount` de las tarjetas de materia
 *   - `course-notify.service` → el flujo "Avísame cuando haya tutor"
 *
 * Así los estudiantes nunca ven una materia con "1 tutor disponible" cuyo
 * único tutor está oculto en el listado.
 */

import { getAvailabilityStatusForTutors } from './tutor-availability-status.service';
import * as courseNotifyRepository from '../repositories/course-notify.repository';
import { isHiddenFromStudents } from '../availability/listing-visibility';

/**
 * IDs de los tutores (de entre los dados) que aparecen para los estudiantes.
 * @param {string[]} tutorIds
 * @returns {Promise<Set<string>>}
 */
export async function getListedTutorIds(tutorIds) {
  const ids = [...new Set((tutorIds ?? []).filter(Boolean))];
  if (ids.length === 0) return new Set();

  const statusByTutor = await getAvailabilityStatusForTutors(ids);
  const listed = new Set();
  for (const id of ids) {
    const status = statusByTutor.get(id) ?? null;
    if (status && !isHiddenFromStudents(status)) listed.add(id);
  }
  return listed;
}

/**
 * Filtra una lista de tutores (objetos con `id`) dejando solo los visibles,
 * conservando el orden. Opcionalmente recorta a `limit`.
 *
 * @template T
 * @param {T[]} tutors
 * @param {{ limit?: number, getId?: (tutor: T) => string }} [options]
 * @returns {Promise<T[]>}
 */
export async function filterListedTutors(tutors, { limit, getId = (t) => t.id } = {}) {
  const list = Array.isArray(tutors) ? tutors : [];
  const listed = await getListedTutorIds(list.map(getId));
  const visible = list.filter((tutor) => listed.has(getId(tutor)));
  return Number.isFinite(limit) && limit > 0 ? visible.slice(0, limit) : visible;
}

/**
 * Tutores visibles por materia, en dos consultas fijas: candidatos (SQL) y
 * semáforo en bloque para los tutores distintos.
 *
 * @param {string[]} courseIds
 * @returns {Promise<Map<string, number>>} courseId → nº de tutores visibles
 */
export async function countListedTutorsForCourses(courseIds) {
  const ids = [...new Set((courseIds ?? []).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const pairs = await courseNotifyRepository.findListingCandidatesForCourses(ids);
  const listed = await getListedTutorIds(pairs.map((p) => p.tutorId));

  const counts = new Map();
  for (const { courseId, tutorId } of pairs) {
    if (!listed.has(tutorId)) continue;
    counts.set(courseId, (counts.get(courseId) ?? 0) + 1);
  }
  return counts;
}

/**
 * @param {string} courseId
 * @returns {Promise<number>}
 */
export async function countListedTutorsForCourse(courseId) {
  if (!courseId) return 0;
  const counts = await countListedTutorsForCourses([courseId]);
  return counts.get(courseId) ?? 0;
}
