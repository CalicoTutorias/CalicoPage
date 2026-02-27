/**
 * UserService
 * 
 * Service to manage users
 *  Matches backend UserController
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

class UserServiceClass {
  /**
   * Get user by UID
   * Backend: GET /users/:uid
   * @param {string} uid - User UID
   * @returns {Promise<Object|null>} User data or null if not found
   */
  async getUserById(uid) {
    try {
      const response = await fetch(`${API_BASE_URL}/users/${uid}`, {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        return data.user || null;
      }
      return null;
    } catch (error) {
      console.error('Error fetching user by ID:', error);
      throw error;
    }
  }

  /**
   * Get user by email
   * Backend: GET /user/by-email/:email
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User data or null if not found
   */
  async getUserByEmail(email) {
    try {
      if (!email) {
        throw new Error('Email is required');
      }

      // Encode email to handle special characters in URL
      const encodedEmail = encodeURIComponent(email.toLowerCase());
      
      const response = await fetch(`${API_BASE_URL}/user/by-email/${encodedEmail}`, {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        return data.user || null;
      }
      return null;
    } catch (error) {
      console.error('Error fetching user by email:', error);
      throw error;
    }
  }

  /**
   * Get all tutors
   * Backend: GET /users/tutors?limit=50
   * @param {number} limit - Maximum number of tutors to return (default: 50)
   * @returns {Promise<Object>} { success, tutors, count }
   */
  async getTutors(limit = 50) {
    try {
      const params = new URLSearchParams();
      if (limit) {
        params.append('limit', limit.toString());
      }
      const queryString = params.toString();
      const url = `${API_BASE_URL}/users/tutors${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        success: data.success || true,
        tutors: data.tutors || [],
        count: data.count || 0,
      };
    } catch (error) {
      console.error('Error fetching tutors:', error);
      throw error;
    }
  }

  /**
   * Get tutors by course
   * Backend: GET /users/tutors?course=courseName&limit=50
   * @param {string} course - Course name
   * @param {number} limit - Maximum number of tutors to return (default: 50)
   * @returns {Promise<Object>} { success, tutors, count }
   */
  async getTutorsByCourse(course, limit = 50000) {
    console.log('Getting tutors by course:', course, limit);
    try {
      if (!course) {
        throw new Error('Course is required');
      }
      // Use the query parameter approach as per the API design
      const params = new URLSearchParams();
      if (course) {
        params.append('course', course);
      }
      if (limit) {
        params.append('limit', limit.toString());
      }
      const queryString = params.toString();
      const url = `${API_BASE_URL}/users/tutors${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
        return {
        success: data.success || true,
        tutors: data.tutors || [],
        count: data.count || 0,
      };
    } catch (error) {
      console.error('Error fetching tutors by course:', error);
      throw error;
    }
  }

  /**
   * Get all available courses
   * Backend: GET /courses
   */
  async getAllCourses() {
    try {
      const response = await fetch(`${API_BASE_URL}/courses`, {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        success: data.success || true,
        courses: data.courses || data.courses || [],
        count: data.count || 0,
      };
    } catch (error) {
      console.error('Error fetching all courses:', error);
      throw error;
    }
  }

  /**
   * Create a new user
   * Backend: POST /user
   * @param {Object} userData - User data (name, email, etc.)
   * @returns {Promise<Object>} { success, user }
   */
  async createUser(userData) {
    try {
      if (!userData) {
        throw new Error('User data is required');
      }

      const response = await fetch(`${API_BASE_URL}/user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        success: data.success || true,
        user: data.user || null,
      };
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Update user by UID
   * Backend: PUT /user/:uid
   * @param {string} uid - User UID
   * @param {Object} userData - User data to update (name, email, etc.)
   * @returns {Promise<Object>} { success, user }
   */
  async updateUser(uid, userData) {
    try {
      if (!uid) {
        throw new Error('User UID is required');
      }
      if (!userData) {
        throw new Error('User data is required');
      }

      const response = await fetch(`${API_BASE_URL}/users/${uid}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        success: data.success || true,
        user: data.user || null,
      };
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  /**
   * Create or update user (convenience method)
   * Uses updateUser which calls the backend's createOrUpdateUser
   * @param {string} uid - User UID
   * @param {Object} userData - User data
   * @returns {Promise<Object>} { success, user }
   */
  async createOrUpdateUser(uid, userData) {
    return this.updateUser(uid, userData);
  }

}

// Export singleton instance
export const UserService = new UserServiceClass();
export default UserService;

