import { authFetch } from '../authFetch';

const API_URL = '/api';

export const ExploreService = {
  getFeaturedTutors: async () => {
    const { ok, data } = await authFetch(`${API_URL}/users/tutors`);
    if (!ok || !data) return [];
    return data.tutors ?? data;
  },
  getCourses: async () => {
    const { ok, data } = await authFetch(`${API_URL}/courses`);
    if (!ok || !data) return [];
    return data;
  },
  getMajors: async () => {
    const { ok, data } = await authFetch(`${API_URL}/majors`);
    if (!ok || !data) return [];
    return data;
  },
  getFacultades: async () => {
    const { ok, data } = await authFetch(`${API_URL}/majors`);
    if (!ok || !data) return [];
    return data;
  },
};
