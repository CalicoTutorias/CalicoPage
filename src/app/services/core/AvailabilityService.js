/**
 * AvailabilityService (Frontend)
 *
 * API client for availability operations - calls local Next.js API routes.
 * Uses authFetch to automatically inject the JWT token.
 * Never throws on HTTP errors — returns graceful defaults instead.
 */

import { authFetch } from '../authFetch';

class AvailabilityServiceClass {
  constructor() {
    this.apiBase = '/api';
  }

  /**
   * Get own availability blocks (tutor)
   * @returns {Promise<Array>}
   */
  async getMyAvailabilities() {
    const { ok, data } = await authFetch(`${this.apiBase}/availabilities/me`);
    if (ok && data) return data.availabilities || [];
    return [];
  }

  /**
   * Create a new availability block
   * @param {{ dayOfWeek: number, startTime: string, endTime: string }} blockData
   */
  async createAvailability(blockData) {
    const { ok, data } = await authFetch(`${this.apiBase}/availabilities`, {
      method: 'POST',
      body: JSON.stringify(blockData),
    });
    if (ok && data) return { success: true, availability: data.availability };
    return { success: false, error: data?.error || 'Failed to create availability' };
  }

  /**
   * Update an availability block
   * @param {string} id
   * @param {{ dayOfWeek?: number, startTime?: string, endTime?: string }} updates
   */
  async updateAvailability(id, updates) {
    const { ok, data } = await authFetch(`${this.apiBase}/availabilities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    if (ok && data) return { success: true, availability: data.availability };
    return { success: false, error: data?.error || 'Failed to update availability' };
  }

  /**
   * Delete an availability block
   * @param {string} id
   */
  async deleteAvailability(id) {
    const { ok, data } = await authFetch(`${this.apiBase}/availabilities/${id}`, {
      method: 'DELETE',
    });
    if (ok) return { success: true };
    return { success: false, error: data?.error || 'Failed to delete availability' };
  }

  /**
   * Atomically replace all blocks for a given day of week
   * @param {number} dayOfWeek  0 (Sun) – 6 (Sat)
   * @param {Array<{ startTime: string, endTime: string }>} blocks
   */
  async bulkReplaceDay(dayOfWeek, blocks) {
    const { ok, data } = await authFetch(`${this.apiBase}/availabilities/bulk-replace`, {
      method: 'POST',
      body: JSON.stringify({ dayOfWeek, blocks }),
    });
    if (ok && data) return { success: true, availabilities: data.availabilities };
    return { success: false, error: data?.error || 'Failed to replace availabilities' };
  }

  /**
   * Get own schedule settings (tutor)
   */
  async getMySchedule() {
    const { ok, data } = await authFetch(`${this.apiBase}/schedules/me`);
    if (ok && data) return { success: true, schedule: data.schedule };
    return { success: false, schedule: null };
  }

  /**
   * Update own schedule settings (tutor)
   * @param {{ bufferTime?: number, maxSessionsPerDay?: number, minBookingNotice?: number, autoAcceptSession?: boolean }} settings
   */
  async updateMySchedule(settings) {
    const { ok, data } = await authFetch(`${this.apiBase}/schedules/me`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    if (ok && data) return { success: true, schedule: data.schedule };
    return { success: false, error: data?.error || 'Failed to update schedule' };
  }

  /**
   * Validate time block data before creation
   */
  validateBlockData(blockData) {
    const errors = [];
    if (blockData.dayOfWeek === undefined || blockData.dayOfWeek === null) errors.push('El día de la semana es requerido');
    if (!blockData.startTime) errors.push('La hora de inicio es requerida');
    if (!blockData.endTime) errors.push('La hora de fin es requerida');

    if (blockData.startTime && blockData.endTime) {
      const start = new Date(`1970-01-01T${blockData.startTime}:00.000Z`);
      const end = new Date(`1970-01-01T${blockData.endTime}:00.000Z`);
      if (end <= start) errors.push('La hora de fin debe ser posterior a la hora de inicio');
    }

    return { isValid: errors.length === 0, errors };
  }
}

const AvailabilityService = new AvailabilityServiceClass();
export { AvailabilityService };
export default AvailabilityService;
