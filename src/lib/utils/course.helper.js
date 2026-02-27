/**
 * Course Helper
 * Utility functions for course name extraction and formatting
 */

/**
 * Extract course code from title (e.g., "ISIS3710 - Web" -> "ISIS3710")
 * @param {string} title - Event title
 * @returns {string|null} Course code or null
 */
export function extractCourseFromTitle(title) {
  if (!title) return null;

  // Match patterns like: ISIS3710, MATE1214, etc.
  const coursePattern = /\b([A-Z]{3,4}\d{4})\b/i;
  const match = title.match(coursePattern);

  return match ? match[1].toUpperCase() : null;
}

/**
 * Format course code consistently
 * @param {string} course - Course code
 * @returns {string} Formatted course code
 */
export function formatCourseCode(course) {
  if (!course) return 'Tutoría General';
  return course.toUpperCase().trim();
}

/**
 * Parse course name from various formats
 * @param {string} input - Course input (could be "ISIS3710", "ISIS 3710", etc.)
 * @returns {string} Standardized course code
 */
export function parseCourse(input) {
  if (!input) return 'Tutoría General';

  // Remove spaces and standardize
  const cleaned = input.replace(/\s+/g, '').toUpperCase();

  // Match valid course pattern
  const coursePattern = /^([A-Z]{3,4})(\d{4})$/;
  const match = cleaned.match(coursePattern);

  return match ? `${match[1]}${match[2]}` : input.toUpperCase().trim();
}

/**
 * Check if string contains a valid course code
 * @param {string} text - Text to check
 * @returns {boolean} True if contains course code
 */
export function containsCourseCode(text) {
  if (!text) return false;
  const coursePattern = /\b([A-Z]{3,4}\d{4})\b/i;
  return coursePattern.test(text);
}

export default {
  extractCourseFromTitle,
  formatCourseCode,
  parseCourse,
  containsCourseCode,
};

