/**
 * FavoritesService - Frontend-only favorites management
 * 
 * Stores favorites in localStorage (no backend endpoints needed)
 * Can fetch enriched data from backend API when needed
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

const STORAGE_KEYS = {
  FAVORITE_TUTORS: 'calico_favorite_tutors',
  FAVORITE_COURSES: 'calico_favorite_courses',
};

class FavoritesServiceClass {
  /**
   * Normalize tutor ID to a consistent format
   * @private
   * @param {Object} tutor - Tutor object with uid, id, or email
   * @returns {string|null} Normalized ID (uid || id || email)
   */
  _normalizeTutorId(tutor) {
    if (!tutor) return null;
    if (typeof tutor === 'string') return tutor;
    return tutor.uid || tutor.id || tutor.email || null;
  }

  /**
   * Initialize favorites from localStorage
   * @private
   */
  _getStoredFavorites(key) {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error(`Error reading favorites from localStorage:`, error);
      return [];
    }
  }

  /**
   * Save favorites to localStorage
   * @private
   */
  _saveFavorites(key, favorites) {
    try {
      localStorage.setItem(key, JSON.stringify(favorites));
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('favorites-updated', { detail: { key, favorites } }));
    } catch (error) {
      console.error(`Error saving favorites to localStorage:`, error);
    }
  }

  // ==================== TUTOR FAVORITES ====================

  /**
   * Get favorite tutor IDs
   * @returns {Array<string>} Array of tutor IDs (emails)
   */
  getFavoriteTutorIds() {
    return this._getStoredFavorites(STORAGE_KEYS.FAVORITE_TUTORS);
  }

  /**
   * Check if a tutor is favorited
   * Checks against stored favorite IDs (exact match)
   * @param {string} tutorId - Tutor ID (uid/id/email) - should be normalized before calling
   * @returns {boolean}
   */
  isTutorFavorite(tutorId) {
    if (!tutorId) return false;
    const favorites = this.getFavoriteTutorIds();
    // Check exact match (normalized IDs should match exactly)
    return favorites.includes(tutorId);
  }

  /**
   * Add a tutor to favorites
   * @param {string|Object} tutorIdOrTutor - Tutor ID string or tutor object
   */
  addTutorFavorite(tutorIdOrTutor) {
    // Normalize the ID if it's a tutor object
    const tutorId = typeof tutorIdOrTutor === 'object' 
      ? this._normalizeTutorId(tutorIdOrTutor)
      : tutorIdOrTutor;
    
    if (!tutorId) return;
    const favorites = this.getFavoriteTutorIds();
    if (!favorites.includes(tutorId)) {
      favorites.push(tutorId);
      this._saveFavorites(STORAGE_KEYS.FAVORITE_TUTORS, favorites);
    }
  }

  /**
   * Remove a tutor from favorites
   * @param {string|Object} tutorIdOrTutor - Tutor ID string or tutor object
   */
  removeTutorFavorite(tutorIdOrTutor) {
    // Normalize the ID if it's a tutor object
    const tutorId = typeof tutorIdOrTutor === 'object' 
      ? this._normalizeTutorId(tutorIdOrTutor)
      : tutorIdOrTutor;
    
    if (!tutorId) return;
    const favorites = this.getFavoriteTutorIds();
    // Remove exact match
    const filtered = favorites.filter(id => id !== tutorId);
    this._saveFavorites(STORAGE_KEYS.FAVORITE_TUTORS, filtered);
  }

  /**
   * Toggle tutor favorite status
   * @param {string|Object} tutorIdOrTutor - Tutor ID string or tutor object
   * @param {boolean} active - Current active state (if true, will remove; if false, will add)
   * @returns {boolean} New favorite status
   */
  toggleTutorFavorite(tutorIdOrTutor, active = null) {
    // Normalize the ID if it's a tutor object
    const tutorId = typeof tutorIdOrTutor === 'object' 
      ? this._normalizeTutorId(tutorIdOrTutor)
      : tutorIdOrTutor;
    
    if (!tutorId) return false;
    
    // If active is not provided, check current status
    const isCurrentlyFavorite = active !== null ? active : this.isTutorFavorite(tutorId);
    
    if (isCurrentlyFavorite) {
      this.removeTutorFavorite(tutorId);
      return false;
    } else {
      this.addTutorFavorite(tutorId);
      return true;
    }
  }

  /**
   * Get count of favorite tutors
   * @returns {number}
   */
  getFavoriteTutorsCount() {
    return this.getFavoriteTutorIds().length;
  }

  // ==================== COURSE FAVORITES ====================

  /**
   * Get favorite course IDs
   * @returns {Array<string>} Array of course IDs
   */
  getFavoriteCourseIds() {
    return this._getStoredFavorites(STORAGE_KEYS.FAVORITE_COURSES);
  }

  /**
   * Check if a course is favorited
   * @param {string} courseId - Course ID
   * @returns {boolean}
   */
  isCourseFavorite(courseId) {
    const favorites = this.getFavoriteCourseIds();
    return favorites.includes(courseId);
  }

  /**
   * Add a course to favorites
   * @param {string} courseId - Course ID
   */
  addCourseFavorite(courseId) {
    // legacy name - calls the implementation method
    return this.addCourseFavorite(courseId);
  }

  /**
   * Add a course to favorites
   * @param {string} courseId - Course ID
   */
  addCourseFavorite(courseId) {
    if (!courseId) return;
    const favorites = this.getFavoriteCourseIds();
    if (!favorites.includes(courseId)) {
      favorites.push(courseId);
      this._saveFavorites(STORAGE_KEYS.FAVORITE_COURSES, favorites);
    }
  }

  /**
   * Remove a course from favorites
   * @param {string} courseId - Course ID
   */
  removeCourseFavorite(courseId) {
    return this.removeCourseFavorite(courseId);
  }

  /**
   * Remove a course from favorites
   * @param {string} courseId - Course ID
   */
  removeCourseFavorite(courseId) {
    if (!courseId) return;
    const favorites = this.getFavoriteCourseIds();
    const filtered = favorites.filter(id => id !== courseId);
    this._saveFavorites(STORAGE_KEYS.FAVORITE_COURSES, filtered);
  }

  /**
   * Toggle course favorite status
   * @param {string} courseId - Course ID
   * @param {boolean} active - Current active state (if true, will remove; if false, will add)
   * @returns {boolean} New favorite status
   */
  toggleCourseFavorite(courseId, active = null) {
    // legacy name - calls the implementation method directly
    return this._toggleCourseFavoriteImpl(courseId, active);
  }

  /**
   * Toggle course favorite status (internal implementation)
   * @param {string} courseId - Course ID
   * @param {boolean} active - Current active state (if true, will remove; if false, will add)
   * @returns {boolean} New favorite status
   */
  _toggleCourseFavoriteImpl(courseId, active = null) {
    if (!courseId) return false;
    
    const isCurrentlyFavorite = active !== null ? active : this.isCourseFavorite(courseId);
    
    if (isCurrentlyFavorite) {
      this.removeCourseFavorite(courseId);
      return false;
    } else {
      this.addCourseFavorite(courseId);
      return true;
    }
  }


  /**
   * Get count of favorite courses
   * @returns {number}
   */
  getFavoriteCoursesCount() {
    return this.getFavoriteCourseIds().length;
  }

  getFavoriteCoursesCount() {
    return this.getFavoriteCourseIds().length;
  }

  // ==================== ENRICHED DATA (from Backend) ====================

  /**
   * Get enriched data for favorite tutors from backend
   * This method fetches tutor details from the backend for all favorited tutors
   * @returns {Promise<Array>} Array of tutor objects with full details
   */
  async getEnrichedFavoriteTutors() {
    const tutorIds = this.getFavoriteTutorIds();
    if (tutorIds.length === 0) return [];

    try {
      // Try to fetch tutor details from backend using UserService
      const UserServiceModule = await import('../core/UserService');
      const UserService = UserServiceModule.UserService;
      
      // Fetch all tutors first to match against favorites (more efficient)
      const allTutorsResponse = await UserService.getTutors(100);
      const allTutors = allTutorsResponse?.tutors || [];
      
      // Match favorited IDs with actual tutor objects
      const enrichedTutors = tutorIds.map((storedId) => {
        // Try to find tutor by matching uid, id, or email
        const matchedTutor = allTutors.find(tutor => 
          (tutor.uid && tutor.uid === storedId) ||
          (tutor.id && tutor.id === storedId) ||
          (tutor.email && tutor.email === storedId)
        );
        
        if (matchedTutor) {
          // Normalize the ID format to uid || id || email
          const normalizedId = matchedTutor.uid || matchedTutor.id || matchedTutor.email;
          return {
            ...matchedTutor,
            id: normalizedId,
            uid: matchedTutor.uid || matchedTutor.id,
            email: matchedTutor.email,
            isFavorite: true,
          };
        }
        
        // Fallback: return basic structure with the stored ID
        // The stored ID might be in a different format, so we'll use it as-is
        return {
          id: storedId,
          uid: storedId,
          email: storedId,
          name: 'Tutor',
          isFavorite: true,
        };
      });
      
      return enrichedTutors.filter(Boolean);
    } catch (error) {
      console.error('Error fetching enriched tutor data:', error);
      // Fallback: return IDs with basic structure
      return tutorIds.map(id => ({
        id,
        uid: id,
        email: id,
        name: 'Tutor',
        isFavorite: true,
      }));
    }
  }

  /**
   * Get enriched data for favorite courses from backend
   * Fetches course details from the courses endpoint
   * @returns {Promise<Array>} Array of course objects with full details
   */
  async getEnrichedFavoriteCourses() {
    const courseIds = this.getFavoriteCourseIds();
    if (courseIds.length === 0) return [];

    try {
      // Try multiple endpoints to get courses
      let allCourses = [];
      
      // Try UserService.getAllCourses first (uses /api/courses)
      try {
        const UserServiceModule = await import('../core/UserService');
        const UserService = UserServiceModule.UserService;
        const coursesResponse = await UserService.getAllCourses();
        if (coursesResponse && coursesResponse.success !== false) {
          const courses = coursesResponse.courses || coursesResponse;
          if (Array.isArray(courses)) {
            // If it returns an array of strings, convert to objects
            allCourses = courses.map(id => ({ id, nombre: id, codigo: id, name: id }));
          }
        }
      } catch (error) {
        console.warn('Could not fetch courses from UserService.getAllCourses:', error);
      }

      // If we didn't get courses, try the /courses endpoint
      if (allCourses.length === 0) {
        try {
          const response = await fetch(`${API_BASE_URL}/courses`, {
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
          });

          if (response.ok) {
            const data = await response.json();
            allCourses = data.materias || data.courses || data.data || [];
            // Ensure it's an array
            if (!Array.isArray(allCourses)) {
              allCourses = [];
            }
          }
        } catch (error) {
          console.warn('Could not fetch courses from /courses endpoint:', error);
        }
      }

      // Fallback removed - using /api/courses endpoint only
      // The old endpoint /user/tutors/courses/all no longer exists

      // Match favorited course IDs with actual course objects
      const enrichedCourses = courseIds.map((storedId) => {
        // Try to find course by matching id, codigo, nombre, or name
        const matchedCourse = allCourses.find(course => {
          const courseId = course.id || course.codigo || course.nombre || course.name;
          return courseId === storedId || 
                 (typeof courseId === 'string' && courseId.toLowerCase() === storedId.toLowerCase());
        });

        if (matchedCourse) {
          return {
            ...matchedCourse,
            id: matchedCourse.id || matchedCourse.codigo || storedId,
            nombre: matchedCourse.nombre || matchedCourse.name || storedId,
            codigo: matchedCourse.codigo || matchedCourse.id || storedId,
            isFavorite: true,
          };
        }

        // Fallback: return basic structure with the stored ID
        return {
          id: storedId,
          nombre: storedId,
          codigo: storedId,
          name: storedId,
          isFavorite: true,
        };
      });

      return enrichedCourses;
    } catch (error) {
      console.error('Error fetching enriched course data:', error);
      // Return basic structure for all favorite IDs as fallback
      return courseIds.map(id => ({ 
        id, 
        nombre: id,
        codigo: id,
        name: id,
        isFavorite: true 
      }));
    }
  }

  /**
   * Get all favorites (both tutors and courses) with enriched data
   * @returns {Promise<Object>} { tutors: [], courses: [] }
   */
  async getAllFavorites() {
    try {
      const [tutors, courses] = await Promise.all([
        this.getEnrichedFavoriteTutors(),
        this.getEnrichedFavoriteCourses(),
      ]);

      return {
        tutors,
        courses,
        totalCount: tutors.length + courses.length,
      };
    } catch (error) {
      console.error('Error fetching all favorites:', error);
      return {
        tutors: [],
        courses: [],
        totalCount: 0,
      };
    }
  }

  // ==================== BULK OPERATIONS ====================

  /**
   * Clear all favorites
   */
  clearAllFavorites() {
    this._saveFavorites(STORAGE_KEYS.FAVORITE_TUTORS, []);
    this._saveFavorites(STORAGE_KEYS.FAVORITE_COURSES, []);
  }

  /**
   * Import favorites (useful for migration or sync)
   * @param {Object} favorites - { tutors: [], courses: [] }
   */
  importFavorites(favorites) {
    if (favorites.tutors && Array.isArray(favorites.tutors)) {
      this._saveFavorites(STORAGE_KEYS.FAVORITE_TUTORS, favorites.tutors);
    }
    if (favorites.courses && Array.isArray(favorites.courses)) {
      // accept old format: courses -> courses
      this._saveFavorites(STORAGE_KEYS.FAVORITE_COURSES, favorites.courses);
    }
  }

  /**
   * Export favorites (useful for backup or sync)
   * @returns {Object} { tutors: [], courses: [] }
   */
  exportFavorites() {
    return {
      tutors: this.getFavoriteTutorIds(),
      courses: this.getFavoriteCourseIds(),
      exportedAt: new Date().toISOString(),
    };
  }

  // ==================== BACKWARDS COMPATIBILITY ====================

  /**
   * Get favorites (backwards compatible with old API)
   * @param {string} userEmail - User email (not used, kept for compatibility)
   * @returns {Promise<Object>} { courses: [], tutors: [] }
   */
  async getFavorites(userEmail = null) {
    const [tutors, courses] = await Promise.all([
      this.getEnrichedFavoriteTutors(),
      this.getEnrichedFavoriteCourses(),
    ]);

    return {
      courses: courses, // Renamed from courses to courses for compatibility
      tutors,
    };
  }

  /**
   * Toggle course favorite (backwards compatible - async version with userEmail)
   * @param {string} userEmail - User email (not used, kept for compatibility)
   * @param {string} courseId - Course/Course ID
   * @param {boolean} active - Current active state
   */
  async toggleCourseFavoriteAsync(userEmail, courseId, active) {
    return this._toggleCourseFavoriteImpl(courseId, active);
  }

  /**
   * Alias for toggleCourseFavorite (backwards compatible)
   */
  async toggleFavoriteCourse(userEmail, courseId, active) {
    return this.toggleCourseFavoriteAsync(userEmail, courseId, active);
  }

  /**
   * Toggle course favorite - handles both old and new API formats
   * If called with 3 parameters: (userEmail, courseId, active) - old API
   * If called with 1-2 parameters: (courseId, active) - new API
   */
  async toggleCourseFavorite(...args) {
    // If called with 3 parameters, it's the old API format (userEmail, courseId, active)
    if (args.length === 3) {
      const [userEmail, courseId, active] = args;
      return this._toggleCourseFavoriteImpl(courseId, active);
    }
    // If called with 1-2 parameters, it's the new API format (courseId, active)
    const [courseId, active] = args;
    return this._toggleCourseFavoriteImpl(courseId, active);
  }

  /**
   * Toggle tutor favorite (backwards compatible - async version)
   * @param {string} userEmail - User email (not used, kept for compatibility)
   * @param {string|Object} tutorIdOrTutor - Tutor ID string or tutor object
   * @param {boolean} active - Current active state
   */
  async toggleFavoriteTutor(userEmail, tutorIdOrTutor, active) {
    return this.toggleTutorFavorite(tutorIdOrTutor, active);
  }
}

// Export singleton instance
export const FavoritesService = new FavoritesServiceClass();
export default FavoritesService;
