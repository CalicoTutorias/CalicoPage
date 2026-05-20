/**
 * UserService
 *
 * Service to manage users.
 * Uses authFetch to automatically inject the JWT token.
 * Never throws on HTTP errors — returns null / empty defaults instead.
 */

import { authFetch } from '../authFetch';

const API_BASE_URL = process.env.API_URL || '/api';

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
   * Get reviews received by a user (tutor)
   * @param {number} userId
   * @param {number} limit
   * @returns {Promise<{ success: boolean, reviews: Array, count: number }>}
   */
  async getReviewsReceived(userId, limit = 20) {
    if (!userId) return { success: false, reviews: [], count: 0 };
    const params = limit ? `?limit=${limit}` : '';
    const { ok, data } = await authFetch(`${API_BASE_URL}/users/${userId}/reviews${params}`);
    if (ok && data?.success) {
      return { success: true, reviews: data.reviews || [], count: data.count || 0 };
    }
    return { success: false, reviews: [], count: 0 };
  }

  /**
   * Get review stats (average + count) for a user
   * @param {number} userId
   * @returns {Promise<{ success: boolean, average: number, count: number }>}
   */
  async getReviewStats(userId) {
    if (!userId) return { success: false, average: 0, count: 0 };
    const { ok, data } = await authFetch(`${API_BASE_URL}/users/${userId}/reviews/stats`);
    if (ok && data?.success) {
      return { success: true, average: data.average || 0, count: data.count || 0 };
    }
    return { success: false, average: 0, count: 0 };
  }

  /**
   * Upload a profile picture for the current user.
   *
   * Orchestrates the three-step flow: compress in browser → request a
   * presigned PUT URL → upload the blob directly to S3 → confirm with the
   * backend so the URL gets persisted on the User row.
   *
   * @param {File} file - The original file from the <input type="file">.
   * @returns {Promise<{ success: boolean, profilePictureUrl?: string, error?: string }>}
   */
  async uploadProfilePicture(file) {
    if (!file) return { success: false, error: 'No se seleccionó archivo' };

    // 1) Compress client-side (dynamic import so we don't ship Canvas code
    //    to non-profile pages).
    let compressed;
    try {
      const mod = await import('../utils/imageCompression');
      compressed = await mod.compressProfilePicture(file);
    } catch (err) {
      return { success: false, error: err.message || 'No se pudo procesar la imagen' };
    }

    // 2) Ask the backend for a presigned URL bound to the compressed size.
    const presign = await authFetch(`${API_BASE_URL}/users/me/profile-picture/presigned-url`, {
      method: 'POST',
      body: JSON.stringify({
        mimeType: compressed.mimeType,
        fileSize: compressed.size,
      }),
    });

    if (!presign.ok || !presign.data?.success) {
      return {
        success: false,
        error: presign.data?.error || 'No se pudo iniciar la subida',
      };
    }

    const { uploadUrl, s3Key } = presign.data;

    // 3) PUT to S3 directly. The presigned URL has ContentLength and the
    //    `status=unconfirmed` tag baked into the signature, so we must send
    //    them as headers verbatim.
    try {
      const s3Res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': compressed.mimeType,
          'x-amz-tagging': 'status=unconfirmed',
        },
        body: compressed.blob,
      });
      if (!s3Res.ok) {
        return { success: false, error: `La subida a S3 falló (${s3Res.status})` };
      }
    } catch (err) {
      return { success: false, error: err.message || 'Error de red al subir' };
    }

    // 4) Confirm — backend verifies, persists URL on User, cleans previous.
    const confirm = await authFetch(`${API_BASE_URL}/users/me/profile-picture`, {
      method: 'PATCH',
      body: JSON.stringify({ s3Key }),
    });

    if (!confirm.ok || !confirm.data?.success) {
      return {
        success: false,
        error: confirm.data?.error || 'No se pudo confirmar la foto',
      };
    }

    return {
      success: true,
      profilePictureUrl: confirm.data.profilePictureUrl,
    };
  }

  /**
   * Remove the current user's profile picture (DB field + S3 object).
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async deleteProfilePicture() {
    const { ok, data } = await authFetch(`${API_BASE_URL}/users/me/profile-picture`, {
      method: 'DELETE',
    });
    if (ok && data?.success) return { success: true };
    return { success: false, error: data?.error || 'No se pudo eliminar la foto' };
  }
}

// Export singleton instance
export const UserService = new UserServiceClass();
export default UserService;
