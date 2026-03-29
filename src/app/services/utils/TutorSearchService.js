import { authFetch } from '../authFetch';

const API_URL = '/api';

async function enrichTutorsWithCourseDetails(tutors) {
  let allCourses = [];
  const coursesResult = await authFetch(`${API_URL}/courses`);
  if (coursesResult.ok && coursesResult.data) {
    allCourses = coursesResult.data.courses || [];
  }

  return tutors.map((tutor) => {
    if (tutor.courses && Array.isArray(tutor.courses)) {
      const enrichedCourses = tutor.courses.map((course) => {
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

export const TutorSearchService = {
  getMaterias: async () => {
    const { ok, data } = await authFetch(`${API_URL}/courses`);
    if (!ok || !data) return [];
    return data.courses;
  },

  /**
   * Get full course information for a list of course IDs
   */
  getMateriasWithDetails: async (courseIds) => {
    const { ok, data } = await authFetch(`${API_URL}/courses`);

    if (!ok || !data) {
      return courseIds.map((id) => ({ nombre: id, codigo: id, name: id }));
    }

    const allCourses = data.materias || data.courses || [];

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
    const { ok, data } = await authFetch(`${API_URL}/users/tutors`);
    if (!ok || !data) return [];

    const tutors = data.tutors || [];
    return enrichTutorsWithCourseDetails(tutors);
  },

  searchTutors: async (query) => {
    const tutors = await TutorSearchService.getAllTutors();
    const tutorsArray = Array.isArray(tutors) ? tutors : [];

    if (!query) return tutorsArray;

    const lowerQuery = query.toLowerCase();
    return tutorsArray.filter((tutor) => {
      let list = tutor.courses || [];
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
   */
  getTutorsByCourse: async (courseInput) => {
    const { courseId, courseName } = courseIdentifiersFromInput(courseInput);
    const lowerName = (courseName || '').toLowerCase();

    const fetchByCourseParam = async (param) => {
      if (!param) return [];
      const params = new URLSearchParams({ limit: '200' });
      params.set('courseId', param);
      const { ok, data } = await authFetch(`${API_URL}/users/tutors?${params.toString()}`);
      if (!ok || !data) return [];
      return data.tutors || [];
    };

    let tutors = [];
    if (courseId) {
      tutors = await fetchByCourseParam(courseId);
    }
    if (tutors.length === 0 && courseName) {
      tutors = await fetchByCourseParam(courseName);
    }
    if (tutors.length === 0) {
      const all = await TutorSearchService.getAllTutors();
      tutors = all.filter((tutor) => {
        let list = tutor.courses || [];
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

    return enrichTutorsWithCourseDetails(tutors);
  },
};
