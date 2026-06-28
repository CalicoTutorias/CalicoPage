import { authFetch } from '../authFetch';

const API_BASE_URL = '/api';

export const CourseNotifyService = {
  async getState(courseId) {
    if (!courseId) return null;
    const params = new URLSearchParams({ courseId });
    const { ok, data } = await authFetch(`${API_BASE_URL}/course-notify-subscriptions/me?${params.toString()}`);
    if (ok && data) return data;
    return null;
  },

  async subscribe(courseId, source = 'unknown') {
    const { ok, status, data } = await authFetch(`${API_BASE_URL}/course-notify-subscriptions`, {
      method: 'POST',
      body: JSON.stringify({ courseId, source }),
    });
    return { ok, status, data };
  },
};

export default CourseNotifyService;
