import { authFetch } from '../authFetch';

const pauseUrl = (courseId) => `/api/tutor/courses/${encodeURIComponent(courseId)}/pause`;

class TutorCourseServiceClass {
  /**
   * Stop offering an approved course.
   * @returns {Promise<{ ok: boolean, status: number, success?: boolean, tutorCourse?: object, code?: string }>}
   */
  async pause(courseId) {
    const { ok, status, data } = await authFetch(pauseUrl(courseId), { method: 'POST' });
    return { ok, status, ...data };
  }

  /** Offer a paused course again. Same response as `pause`. */
  async resume(courseId) {
    const { ok, status, data } = await authFetch(pauseUrl(courseId), { method: 'DELETE' });
    return { ok, status, ...data };
  }
}

export const TutorCourseService = new TutorCourseServiceClass();
