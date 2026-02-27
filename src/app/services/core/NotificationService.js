const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

async function safeJson(res) {
  if (!res.ok) {
    const text = await res.text();
    // If response is HTML (like a 404 page), return empty result instead of throwing
    if (text && text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      console.warn('Received HTML response instead of JSON, endpoint may not exist:', res.url);
      return null;
    }
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export const NotificationService = {
  async getTutorNotifications(userId, limit = 50) {
    if (!userId) return [];
    
    try {
      const url = `${API_BASE_URL}/notifications/user/${encodeURIComponent(userId)}?limit=${limit}`;
      const res = await fetch(url, { 
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const data = await safeJson(res);
      if (!data) return []; // Handle case where endpoint doesn't exist
      
      return data.notifications || data || [];
    } catch (error) {
      console.error('Error fetching tutor notifications:', error);
      return [];
    }
  },

  async getStudentNotifications(userId, limit = 50) {
    return this.getTutorNotifications(userId, limit);
  },

  async markNotificationAsRead(notificationId) {
    if (!notificationId) return null;
    
    try {
      const url = `${API_BASE_URL}/notifications/${encodeURIComponent(notificationId)}/read`;
      const res = await fetch(url, { 
        method: 'PUT', 
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return await safeJson(res);
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return null;
    }
  },

  async markAllAsRead(userId) {
    if (!userId) return [];
    
    try {
      // Fetch unread notifications then mark them read one-by-one
      const url = `${API_BASE_URL}/notifications/user/${encodeURIComponent(userId)}/unread`;
      const res = await fetch(url, { 
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const data = await safeJson(res);
      if (!data) return [];
      
      const notifications = data.notifications || [];
      const results = [];
      for (const n of notifications) {
        try {
          const r = await fetch(`${API_BASE_URL}/notifications/${encodeURIComponent(n.id)}/read`, { 
            method: 'PUT', 
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
          });
          const result = await safeJson(r);
          if (result) results.push(result);
        } catch (e) {
          // continue marking others
          console.warn('Error marking notification as read:', n.id, e);
        }
      }
      return results;
    } catch (error) {
      console.error('Error in markAllAsRead:', error);
      return [];
    }
  },

  async deleteNotification(notificationId) {
    if (!notificationId) return null;
    
    try {
      const url = `${API_BASE_URL}/notifications/${encodeURIComponent(notificationId)}`;
      const res = await fetch(url, { 
        method: 'DELETE', 
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return await safeJson(res);
    } catch (error) {
      console.error('Error deleting notification:', error);
      return null;
    }
  },

  async createNotification(payload) {
    try {
      const url = `${API_BASE_URL}/notifications`;
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      return await safeJson(res);
    } catch (error) {
      console.error('Error creating notification:', error);
      return null;
    }
  }
};

export default NotificationService;
