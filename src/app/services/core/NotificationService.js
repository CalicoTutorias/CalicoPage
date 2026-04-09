/**
 * NotificationService (Core)
 *
 * Uses authFetch to automatically inject the JWT token.
 * Never throws on HTTP errors — returns null / empty defaults instead.
 */

import { authFetch } from '../authFetch';

const API_BASE_URL = process.env.API_URL || '/api';

export const NotificationService = {
  async getTutorNotifications(userId, limit = 50) {
    if (!userId) return [];
    const url = `${API_BASE_URL}/notifications/user/${encodeURIComponent(userId)}?limit=${limit}`;
    const { ok, data } = await authFetch(url);
    if (!ok || !data) return [];
    return data.notifications || data || [];
  },

  async getStudentNotifications(userId, limit = 50) {
    return this.getTutorNotifications(userId, limit);
  },

  async markNotificationAsRead(notificationId) {
    if (!notificationId) return null;
    const url = `${API_BASE_URL}/notifications/${encodeURIComponent(notificationId)}/read`;
    const { ok, data } = await authFetch(url, { method: 'PUT' });
    if (ok && data) return data;
    return null;
  },

  async markAllAsRead() {
    const url = `${API_BASE_URL}/notifications/read-all`;
    const { ok, data } = await authFetch(url, { method: 'PUT' });
    if (ok && data) return data;
    return null;
  },

  async deleteNotification(notificationId) {
    if (!notificationId) return null;
    const url = `${API_BASE_URL}/notifications/${encodeURIComponent(notificationId)}`;
    const { ok, data } = await authFetch(url, { method: 'DELETE' });
    if (ok && data) return data;
    return null;
  },

  async createNotification(payload) {
    const url = `${API_BASE_URL}/notifications`;
    const { ok, data } = await authFetch(url, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (ok && data) return data;
    return null;
  },
};

export default NotificationService;
