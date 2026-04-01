/**
 * UserService
 *
 * Service to manage users.
 * Uses authFetch to automatically inject the JWT token.
 * Never throws on HTTP errors — returns null / empty defaults instead.
 */

import { authFetch } from '../authFetch';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

class UserServiceClass {
  /**
   * Get user by UID
   * @param {string} uid
   * @returns {Promise<Object|null>}
   */
  async getUserById(uid) {
    const { ok, data } = await authFetch(`${API_BASE_URL}/users/${uid}`);
    if (ok && data?.success) {
      return data.user || null;
    }
    return null;
  }

  /**
   * Get user by email
   * @param {string} email
   * @returns {Promise<Object|null>}
   */
  async getUserByEmail(email) {
    if (!email) return null;
    const encodedEmail = encodeURIComponent(email.toLowerCase());
    const { ok, data } = await authFetch(`${API_BASE_URL}/user/by-email/${encodedEmail}`);
    if (ok && data?.success) {
      return data.user || null;
    }
    return null;
  }

  /**
   * Get all tutors
   * @param {number} limit
   * @returns {Promise<{ success: boolean, tutors: Array, count: number }>}
   */
  async getTutors(limit = 50) {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    const qs = params.toString();
    const url = `${API_BASE_URL}/users/tutors${qs ? `?${qs}` : ''}`;

    const { ok, data } = await authFetch(url);
    if (ok && data) {
      return {
        success: true,
        tutors: data.tutors || [],
        count: data.count || 0,
      };
    }
    return { success: false, tutors: [], count: 0 };
  }

  /**
   * Get tutors by course
   * @param {string} course
   * @param {number} limit
   * @returns {Promise<{ success: boolean, tutors: Array, count: number }>}
   */
  async getTutorsByCourse(course, limit = 50) {
    if (!course) return { success: false, tutors: [], count: 0 };

    const params = new URLSearchParams();
    params.append('course', course);
    if (limit) params.append('limit', limit.toString());
    const url = `${API_BASE_URL}/users/tutors?${params.toString()}`;

    const { ok, data } = await authFetch(url);
    if (ok && data) {
      return {
        success: true,
        tutors: data.tutors || [],
        count: data.count || 0,
      };
    }
    return { success: false, tutors: [], count: 0 };
  }

  /**
   * Get all available courses
   * @returns {Promise<{ success: boolean, courses: Array, count: number }>}
   */
  async getAllCourses() {
    const { ok, data } = await authFetch(`${API_BASE_URL}/courses`);
    if (ok && data) {
      return {
        success: true,
        courses: data.courses || [],
        count: data.count || 0,
      };
    }
    return { success: false, courses: [], count: 0 };
  }

  /**
   * Create a new user
   * @param {Object} userData
   * @returns {Promise<{ success: boolean, user: Object|null }>}
   */
  async createUser(userData) {
    if (!userData) return { success: false, user: null };

    const { ok, data } = await authFetch(`${API_BASE_URL}/user`, {
      method: 'POST',
      body: JSON.stringify(userData),
    });

    if (ok && data) {
      return { success: true, user: data.user || null };
    }
    return { success: false, user: null };
  }

  /**
   * Update user by UID
   * @param {string} uid
   * @param {Object} userData
   * @returns {Promise<{ success: boolean, user: Object|null }>}
   */
  async updateUser(uid, userData) {
    if (!uid || !userData) return { success: false, user: null };

    const { ok, data } = await authFetch(`${API_BASE_URL}/users/${uid}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    });

    if (ok && data) {
      return { success: true, user: data.user || null };
    }
    return { success: false, user: null };
  }

  /**
   * Create or update user (convenience method)
   */
  async createOrUpdateUser(uid, userData) {
    return this.updateUser(uid, userData);
  }
}

// Export singleton instance
export const UserService = new UserServiceClass();
export default UserService;
