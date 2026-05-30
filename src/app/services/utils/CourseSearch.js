import Fuse from 'fuse.js';
import { normalizeText } from './normalizeText';

// Único punto de acoplamiento de la lógica de búsqueda de materias.
// Hoy corre en cliente con Fuse; si el catálogo escala, se reemplaza el
// cuerpo por un fetch a /api/courses/search sin tocar los componentes.
const FUSE_OPTIONS = {
  ignoreLocation: true,
  threshold: 0.4,
  keys: [
    { name: 'aliasText', weight: 3 },
    { name: 'codeText', weight: 2 },
    { name: 'nameText', weight: 1.5 },
    { name: 'topicsText', weight: 0.5 },
  ],
};

function toIndexable(course) {
  const name = course?.nombre ?? course?.name ?? (typeof course === 'string' ? course : '');
  const code = course?.codigo ?? course?.code ?? '';
  const aliases = Array.isArray(course?.aliases) ? course.aliases : [];
  const topics = Array.isArray(course?.topics) ? course.topics : [];
  return {
    ref: course,
    nameText: normalizeText(name),
    codeText: normalizeText(code),
    aliasText: aliases.map(normalizeText),
    topicsText: topics.map((topic) => normalizeText(topic?.name ?? topic)),
  };
}

/** Construye un buscador con el índice ya armado; reutilizable entre keystrokes. */
export function createCourseSearcher(courses) {
  const list = Array.isArray(courses) ? courses : [];
  const fuse = new Fuse(list.map(toIndexable), FUSE_OPTIONS);
  return {
    search(query) {
      const normalized = normalizeText(query);
      if (!normalized) return list;
      return fuse.search(normalized).map((result) => result.item.ref);
    },
  };
}

/** Conveniencia para una búsqueda puntual. */
export function searchCourses(courses, query) {
  return createCourseSearcher(courses).search(query);
}
