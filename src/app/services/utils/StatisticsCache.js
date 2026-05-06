/**
 * StatisticsCache - Cache for tutor statistics calculations
 * Stores calculated values during a session and provides them
 * without recalculation until the session ends or cache is invalidated
 */

class StatisticsCacheService {
  constructor() {
    this.cacheMap = new Map(); // Maps tutorId -> cacheData
  }

  /**
   * Generate a cache key for a tutor
   */
  getCacheKey(tutorId) {
    return `stats_${tutorId}`;
  }

  /**
   * Get cached statistics for a tutor
   */
  getCache(tutorId) {
    const key = this.getCacheKey(tutorId);
    const cached = this.cacheMap.get(key);
    
    if (cached && this.isValid(cached)) {
      return cached.data;
    }
    
    // Remove expired cache
    this.cacheMap.delete(key);
    return null;
  }

  /**
   * Set cached statistics for a tutor
   */
  setCache(tutorId, data) {
    const key = this.getCacheKey(tutorId);
    this.cacheMap.set(key, {
      data,
      timestamp: Date.now(),
      sessionId: this.getSessionId(),
    });
  }

  /**
   * Check if cache is still valid
   * Cache is valid only within the same session
   */
  isValid(cacheEntry) {
    const MAX_CACHE_TIME = 30 * 60 * 1000; // 30 minutes
    const now = Date.now();
    return (now - cacheEntry.timestamp) < MAX_CACHE_TIME && 
           cacheEntry.sessionId === this.getSessionId();
  }

  /**
   * Get or create session ID
   * Session ID changes when user navigates away and back or on page reload
   */
  getSessionId() {
    const key = 'tutor_stats_session_id';
    let sessionId = sessionStorage.getItem(key);
    
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem(key, sessionId);
    }
    
    return sessionId;
  }

  /**
   * Invalidate cache for a tutor
   */
  invalidateCache(tutorId) {
    const key = this.getCacheKey(tutorId);
    this.cacheMap.delete(key);
  }

  /**
   * Clear all cache
   */
  clearCache() {
    this.cacheMap.clear();
  }

  /**
   * Reset session on logout or explicit invalidation
   */
  resetSession() {
    sessionStorage.removeItem('tutor_stats_session_id');
    this.clearCache();
  }
}

// Singleton instance
export const statisticsCache = new StatisticsCacheService();
export default StatisticsCacheService;
