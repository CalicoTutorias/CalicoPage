import { authFetch } from '../authFetch';

const API_URL = '/api';

/** Single GET /api/courses; reused to avoid duplicate calls when enriching tutors. */
async function fetchAllCourses() {
  const { ok, data } = await authFetch(`${API_URL}/courses`);
  if (!ok || !data) return [];
  return data.courses || data.materias || [];
}

function enrichTutorsWithCourseDetails(tutors, allCourses) {
  return tutors.map((tutor) => {
    if (tutor.tutorProfile?.tutorCourses && Array.isArray(tutor.tutorProfile?.tutorCourses)) {
      const enrichedCourses = tutor.tutorProfile?.tutorCourses.map((course) => {
        if (typeof course === 'string') {
          const found = allCourses.find((c) => c.id === course || c.codigo === course);
          if (found) return { ...found, originalId: course };
          return course;
        }
        return course;
      });
      return { ...tutor, courses: enrichedCourses };
    }
    return tutor;
  });
}

function courseIdentifiersFromInput(courseInput) {
  if (courseInput == null) return { courseId: null, courseName: '' };
  if (typeof courseInput === 'string') {
    return { courseId: null, courseName: courseInput };
  }
  return {
    courseId: courseInput.id || courseInput.codigo || null,
    courseName: courseInput.nombre || courseInput.name || '',
  };
}

async function fetchTutorsByCourseParam(param) {
  if (!param) return [];
  const params = new URLSearchParams({ limit: '200' });
  params.set('courseId', param);
  const { ok, data } = await authFetch(`${API_URL}/users/tutors?${params.toString()}`);
  if (!ok || !data) return [];
  return data.tutors || [];
}

export const TutorSearchService = {
  getMaterias: () => fetchAllCourses(),

  /**
   * Get full course information for a list of course IDs
   */
  getMateriasWithDetails: async (courseIds) => {
    const allCourses = await fetchAllCourses();
    if (!allCourses.length) {
      return courseIds.map((id) => ({ nombre: id, codigo: id, name: id, id }));
    }

    return courseIds.map((id) => {
      const found = allCourses.find(
        (course) =>
          course.id === id || course.codigo === id || course.nombre === id || course.name === id
      );
      if (found) return found;
      return { nombre: id, codigo: id, name: id, id };
    });
  },

  getAllTutors: async () => {
    const [{ ok, data }, allCourses] = await Promise.all([
      authFetch(`${API_URL}/users/tutors`),
      fetchAllCourses(),
    ]);
    if (!ok || !data) return [];

    const tutors = data.tutors || [];
    return enrichTutorsWithCourseDetails(tutors, allCourses);
  },

  searchTutors: async (query) => {
    const tutors = await TutorSearchService.getAllTutors();
    const tutorsArray = Array.isArray(tutors) ? tutors : [];

    if (!query) return tutorsArray;

    const lowerQuery = query.toLowerCase();
    return tutorsArray.filter((tutor) => {
      let list = tutor.tutorProfile?.tutorCourses || [];
      if (typeof list === 'string') list = [list];
      else if (!Array.isArray(list)) list = [];

      return (
        tutor.name?.toLowerCase().includes(lowerQuery) ||
        tutor.email?.toLowerCase().includes(lowerQuery) ||
        list.some((course) => {
          const cName = typeof course === 'string' ? course : course.nombre || course.name || '';
          return cName.toLowerCase().includes(lowerQuery);
        })
      );
    });
  },

  /**
   * Tutores que dictan una materia. Prioriza el ID del curso (coincide con Firestore `users.courses`).
   * `/api/courses` se pide en paralelo con la búsqueda de tutores para reducir latencia.
   */
  getTutorsByCourse: async (courseInput) => {
    const { courseId, courseName } = courseIdentifiersFromInput(courseInput);
    const lowerName = (courseName || '').toLowerCase();

    const coursesPromise = fetchAllCourses();

    let tutors = [];
    if (courseId) {
      tutors = await fetchTutorsByCourseParam(courseId);
    }
    if (tutors.length === 0 && courseName) {
      tutors = await fetchTutorsByCourseParam(courseName);
    }

    const allCourses = await coursesPromise;

    if (tutors.length === 0) {
      const { ok, data } = await authFetch(`${API_URL}/users/tutors`);
      const allTutors = ok && data ? (data.tutors || []) : [];
      tutors = allTutors.filter((tutor) => {
        let list = tutor.tutorProfile?.tutorCourses || [];
        if (typeof list === 'string') list = [list];
        else if (!Array.isArray(list)) list = [];

        return list.some((s) => {
          if (typeof s === 'string') {
            if (courseId && s === courseId) return true;
            if (lowerName) return s.toLowerCase().includes(lowerName);
            return false;
          }
          const cid = s.id || s.codigo;
          const cname = s.nombre || s.name || '';
          if (courseId && cid === courseId) return true;
          if (lowerName) return cname.toLowerCase().includes(lowerName);
          return false;
        });
      });
    }

    return enrichTutorsWithCourseDetails(tutors, allCourses);
  },
};
