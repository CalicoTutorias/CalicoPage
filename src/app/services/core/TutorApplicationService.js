import { authFetch } from '../authFetch';

class TutorApplicationServiceClass {
  /**
   * Submit a new tutor application.
   * @param {{ reasonsToTeach: string, subjects: string[], contactInfo: { phone: string, preferredMethod: string } }} payload
   * @returns {Promise<{ success: boolean, application?: object, error?: string }>}
   */
  async submit(payload) {
    const { ok, status, data } = await authFetch('/api/tutor-applications', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return { ok, status, ...data };
  }
}

export const TutorApplicationService = new TutorApplicationServiceClass();
