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
   * Get joint availability for all tutors teaching a specific course.
   * Uses /api/users/tutors to list tutors, then /api/availabilities/me per tutor (or a bulk endpoint).
   */
  async getJointAvailabilityByCourse(courseName, courseId = null) {
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (courseId) {
        params.set('courseId', courseId);
      } else if (courseName) {
        params.set('course', courseName);
      }
      const { ok: tutorsOk, data: tutorsData } = await authFetch(
        `${this.apiBase}/users/tutors?${params.toString()}`
      );
      if (!tutorsOk || !tutorsData) {
        return { success: false, tutorsAvailability: [], totalTutors: 0, connectedTutors: 0, totalSlots: 0 };
      }
      const tutors = tutorsData.tutors || [];
      if (tutors.length === 0) {
        return { success: true, tutorsAvailability: [], totalTutors: 0, connectedTutors: 0, totalSlots: 0 };
      }
      const tutorNameMap = {};
      const tutorIds = tutors.map(t => {
        const id = t.uid || t.id;
        tutorNameMap[id] = t.name || id;
        return id;
      });
      const { ok, data } = await authFetch(`${this.apiBase}/availability/joint/multiple`, {
        method: 'POST',
        body: JSON.stringify({ tutorIds }),
      });
      if (!ok || !data) {
        return { success: false, tutorsAvailability: [], totalTutors: tutors.length, connectedTutors: 0, totalSlots: 0 };
      }
      const tutorsAvailability = (data.tutorsAvailability || []).map(entry => ({
        ...entry,
        tutorName: tutorNameMap[entry.tutorId] || entry.tutorId,
      }));
      return {
        success: true,
        tutorsAvailability,
        totalTutors: data.totalTutors,
        connectedTutors: data.connectedTutors,
        totalSlots: data.totalSlots,
      };
    } catch (error) {
      console.error('Error in getJointAvailabilityByCourse:', error);
      return { success: false, tutorsAvailability: [], totalTutors: 0, connectedTutors: 0, totalSlots: 0 };
    }
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

  /**
   * @param {string} [_tutorKey] Legacy param — availability uses JWT; ignored.
   * @returns {Promise<{ availabilitySlots: Array, connected: boolean, usingMockData: boolean }>}
   */
  async getAvailabilityWithFallback(_tutorKey) {
    const [blocks, connRes] = await Promise.all([
      this.getMyAvailabilities(),
      authFetch(`${this.apiBase}/calendar/check-connection`, { credentials: 'include' }),
    ]);
    const connected =
      !!connRes.ok &&
      connRes.data?.connected &&
      connRes.data?.tokenValid;
    const availabilitySlots = this._expandWeeklyBlocksToDatedSlots(blocks);
    return {
      availabilitySlots,
      connected,
      usingMockData: false,
    };
  }

  /**
   * Expand recurring weekly blocks into dated rows for calendar UI (next N weeks).
   * @param {Array<{ id: string, dayOfWeek: number, startTime: Date|string, endTime: Date|string }>} blocks
   */
  _expandWeeklyBlocksToDatedSlots(blocks, weeksAhead = 12) {
    if (!Array.isArray(blocks) || blocks.length === 0) return [];

    const toHHMM = (v) => {
      if (!v) return '00:00';
      const d = v instanceof Date ? v : new Date(v);
      const h = d.getUTCHours().toString().padStart(2, '0');
      const m = d.getUTCMinutes().toString().padStart(2, '0');
      return `${h}:${m}`;
    };

    const slots = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + weeksAhead * 7);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      const dateStr = d.toISOString().split('T')[0];
      for (const block of blocks) {
        if (block.dayOfWeek !== dow) continue;
        slots.push({
          id: `${block.id}-${dateStr}`,
          date: dateStr,
          startTime: toHHMM(block.startTime),
          endTime: toHHMM(block.endTime),
          title: 'Disponible',
          description: '',
          location: '',
          isBooked: false,
        });
      }
    }
    return slots;
  }

  /** No-op — legacy Google auto-sync not used with PostgreSQL availability. */
  stopAutoSync() {}

  /**
   * Validate "add slot" form (date + time fields) for UnifiedAvailability.
   * @param {{ title?: string, date?: string, startTime?: string, endTime?: string }} slot
   */
  validateEventData(slot) {
    const errors = [];
    if (!slot.title || !String(slot.title).trim()) errors.push('El título es requerido');
    if (!slot.date) errors.push('La fecha es requerida');
    if (!slot.startTime) errors.push('La hora de inicio es requerida');
    if (!slot.endTime) errors.push('La hora de fin es requerida');

    if (slot.startTime && slot.endTime) {
      const start = new Date(`1970-01-01T${slot.startTime}:00.000Z`);
      const end = new Date(`1970-01-01T${slot.endTime}:00.000Z`);
      if (end <= start) errors.push('La hora de fin debe ser posterior a la hora de inicio');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (slot.date) {
      const day = new Date(`${slot.date}T12:00:00`);
      if (!Number.isNaN(day.getTime()) && day < today) {
        errors.push('No se puede crear un horario en el pasado');
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Create a weekly availability block from the modal (same day-of-week as chosen date).
   * @param {string|number} [_tutorId] Ignored — server uses JWT.
   * @param {{ date: string, startTime: string, endTime: string }} newSlot
   */
  async createAvailabilityEvent(_tutorId, newSlot) {
    const parsed = new Date(`${newSlot.date}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return { success: false, message: 'Fecha inválida' };
    }
    const dayOfWeek = parsed.getDay();
    const result = await this.createAvailability({
      dayOfWeek,
      startTime: newSlot.startTime,
      endTime: newSlot.endTime,
    });
    if (result.success) {
      return { success: true, message: 'Horario agregado', availability: result.availability };
    }
    return { success: false, message: result.error || 'No se pudo crear el horario' };
  }

  /**
   * Sync availability from the tutor's "Disponibilidad" Google Calendar.
   * Calls POST /api/availabilities/sync-from-calendar (credentials: include so
   * the httpOnly calendar cookies are forwarded automatically).
   *
   * @returns {Promise<{ success: boolean, synced: number, removed: number, skipped: number, total: number, error?: string }>}
   */
  async intelligentSync(_tutorId, _calendarName, _daysAhead) {
    const { ok, data } = await authFetch(
      `${this.apiBase}/availabilities/sync-from-calendar`,
      { method: 'POST', credentials: 'include' },
    );

    if (ok && data?.success) {
      return {
        success: true,
        synced:  data.synced  ?? 0,
        removed: data.removed ?? 0,
        skipped: data.skipped ?? 0,
        total:   data.total   ?? 0,
      };
    }

    return { success: false, error: data?.error || 'Error al sincronizar el calendario.' };
  }
}

const AvailabilityService = new AvailabilityServiceClass();
export { AvailabilityService };
export default AvailabilityService;
