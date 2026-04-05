/**
 * Timezone Utilities for Colombia (UTC-5)
 * 
 * Handles conversion and display of times between UTC and Colombia timezone
 * using the IANA timezone identifier 'America/Bogota'
 */

/**
 * Format a UTC date as Colombia local time (full date and time)
 * 
 * @param {Date | string} utcDate - UTC date from database or API
 * @param {string} locale - Locale code (default: 'es-CO' for Spanish Colombia)
 * @returns {string} Formatted date-time string in Colombia timezone
 */
export function formatColombiaDateTime(utcDate, locale = 'es-CO') {
  if (!utcDate) return '';
  
  const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  if (!date || isNaN(date.getTime())) return '';
  
  try {
    return date.toLocaleString(locale, {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (e) {
    console.warn('Error formatting Colombia time:', e);
    return date.toLocaleString(locale);
  }
}

/**
 * Format a UTC date as Colombia local date only (no time)
 * 
 * @param {Date | string} utcDate - UTC date from database or API
 * @param {string} locale - Locale code (default: 'es-CO' for Spanish Colombia)
 * @returns {string} Formatted date string in Colombia timezone
 */
export function formatColombiaDate(utcDate, locale = 'es-CO') {
  if (!utcDate) return '';
  
  const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  if (!date || isNaN(date.getTime())) return '';
  
  try {
    return date.toLocaleDateString(locale, {
      timeZone: 'America/Bogota',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (e) {
    console.warn('Error formatting Colombia date:', e);
    return date.toLocaleDateString(locale);
  }
}

/**
 * Format a UTC date as Colombia local time only (no date)
 * 
 * @param {Date | string} utcDate - UTC date from database or API
 * @param {string} locale - Locale code (default: 'es-CO' for Spanish Colombia)
 * @returns {string} Formatted time string in Colombia timezone (HH:mm format)
 */
export function formatColombiaTme(utcDate, locale = 'es-CO') {
  if (!utcDate) return '';
  
  const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  if (!date || isNaN(date.getTime())) return '';
  
  try {
    return date.toLocaleTimeString(locale, {
      timeZone: 'America/Bogota',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    console.warn('Error formatting Colombia time:', e);
    return date.toLocaleTimeString(locale);
  }
}

/**
 * Get Colombia local time components from a UTC date
 * Useful for working with date/time parts programmatically
 * 
 * @param {Date | string} utcDate - UTC date from database or API
 * @returns {Object} Object with { year, month, day, hour, minute, second, millisecond }
 */
export function getColombiaTmeComponents(utcDate) {
  if (!utcDate) return null;
  
  const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  if (!date || isNaN(date.getTime())) return null;
  
  try {
    // Get Colombia local time as string, then parse it
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(date);
    const dateObj = {};
    
    parts.forEach(({ type, value }) => {
      if (type !== 'literal') {
        dateObj[type] = parseInt(value, 10);
      }
    });
    
    return {
      year: dateObj.year,
      month: dateObj.month,
      day: dateObj.day,
      hour: dateObj.hour,
      minute: dateObj.minute,
      second: dateObj.second
    };
  } catch (e) {
    console.warn('Error getting Colombia time components:', e);
    return null;
  }
}

/**
 * Convert a UTC date to a Colombia-aware Date object for display
 * NOTE: The returned Date object represents an earlier point in time 
 * (adjusted by 5 hours), but when displayed it will show Colombia local time
 * in most contexts. Use this carefully or prefer the format functions above.
 * 
 * @param {Date | string} utcDate - UTC date from database or API
 * @returns {Date} Adjusted Date object that displays Colombia time
 * @deprecated Prefer using formatColombiaDate/formatColombiaTme instead
 */
export function convertUTCToColombiaTime(utcDate) {
  if (!utcDate) return null;
  
  const date = typeof utcDate === 'string' ? new Date(utcDate) : new Date(utcDate);
  if (isNaN(date.getTime())) return null;
  
  // Subtract 5 hours (Colombia is UTC-5) to get a Date object
  // that displays Colombia time when converted to string
  const utcTime = date.getTime();
  const colombiaTime = new Date(utcTime - (5 * 60 * 60 * 1000));
  
  return colombiaTime;
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use formatColombiaTme instead
 */
export function formatColombiaTmmeOnly(utcDate, locale = 'es-CO') {
  return formatColombiaTme(utcDate, locale);
}
