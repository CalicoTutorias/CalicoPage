import { authFetch } from '../authFetch';

const API_URL = '/api';

export const TutoringSessionService = {
  getCourseId: async (course) => {
    const { ok, data } = await authFetch(`${API_URL}/courses/`);
    if (!ok || !data) return null;

    let coursesArray = null;
    if (Array.isArray(data)) {
      coursesArray = data;
    } else if (data.data && Array.isArray(data.data)) {
      coursesArray = data.data;
    } else if (data.courses && Array.isArray(data.courses)) {
      coursesArray = data.courses;
    } else {
      return null;
    }

    if (!coursesArray || coursesArray.length === 0) return null;

    const courseItem = coursesArray.find(
      (item) => item.course === course || item.name === course
    );
    return courseItem?.uid || courseItem?.id || null;
  },

  createSession: async (sessionData) => {
    const { ok, data } = await authFetch(`${API_URL}/tutoring-sessions`, {
      method: 'POST',
      body: JSON.stringify(sessionData),
    });

    if (ok && data) return data;
    console.error('Error creating session:', data?.error || data?.message);
    return { success: false, error: data?.error || 'Error creating session' };
  },

  bookSpecificSlot: async (slot, studentEmail, studentName, notes, course, courseId) => {
    const sessionData = {
      tutorEmail: slot.tutorEmail || slot.tutorId,
      tutorId: slot.tutorId,
      tutorName: slot.tutorName,
      studentEmail,
      studentName,
      course: course || slot.course || 'Tutoring',
      courseId: courseId || slot.courseId || course || slot.course || 'Tutoring',
      scheduledDateTime: slot.startDateTime,
      endDateTime: slot.endDateTime,
      location: slot.location || 'Virtual',
      notes,
      price: slot.price || 50000,
      parentAvailabilityId: slot.parentAvailabilityId || slot.id,
      slotId: slot.id,
      status: 'pending',
      paymentStatus: 'pending',
      requestedAt: new Date(),
    };
    return await TutoringSessionService.createSession(sessionData);
  },

  getStudentSessions: async (studentId) => {
    const { ok, data } = await authFetch(`${API_URL}/tutoring-sessions/student/${studentId}`);
    if (!ok || !data) return [];
    return data;
  },

  getTutorSessions: async (tutorId) => {
    const { ok, data } = await authFetch(`${API_URL}/tutoring-sessions/tutor/${tutorId}`);
    if (!ok || !data) return [];
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.sessions)) return data.sessions;
    if (data && Array.isArray(data.data)) return data.data;
    return [];
  },

  getHistory: async (studentId) => {
    const { ok, data } = await authFetch(
      `${API_URL}/tutoring-sessions/student/${studentId}/history`
    );
    if (!ok || !data) return [];
    return data;
  },

  getSessionById: async (sessionId) => {
    const { ok, data } = await authFetch(`${API_URL}/tutoring-sessions/${sessionId}`);
    if (!ok || !data) return null;
    return data?.session || data || null;
  },

  updateSession: async (sessionId, updateData) => {
    const { ok, data } = await authFetch(`${API_URL}/tutoring-sessions/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });

    if (ok && data) return data;
    console.error('Error updating session:', data?.error || data?.message);
    return { success: false, error: data?.error || 'Error updating session' };
  },

  getPendingSessionsForTutor: async (tutorId, limit = 50) => {
    const params = new URLSearchParams({ limit: String(limit) });
    const { ok, data } = await authFetch(
      `${API_URL}/tutoring-sessions/tutor/${encodeURIComponent(tutorId)}/pending?${params.toString()}`
    );
    if (ok && data?.success) return data.sessions || [];
    return [];
  },

  getSlotBookingsForAvailability: async (availabilityId) => {
    return [];
  },

  getSlotBooking: async (parentAvailabilityId, slotIndex, tutorId) => {
    const { ok, data } = await authFetch(`${API_URL}/availability/slots/check-availability`, {
      method: 'POST',
      body: JSON.stringify({ tutorId, parentAvailabilityId, slotIndex }),
    });
    if (!ok || !data || !data.success) return null;
    return data.available ? null : (data.booking || true);
  },

  addReview: async (sessionId, reviewData) => {
    const { ok, data } = await authFetch(`${API_URL}/tutoring-sessions/${sessionId}/reviews`, {
      method: 'POST',
      body: JSON.stringify(reviewData),
    });

    if (ok && data) return data;
    console.error('Error adding review:', data?.error || data?.message);
    return { success: false, error: data?.error || 'Error adding review' };
  },

  getTutorWeeklyPerformance: async (tutorId) => {
    const sessions = await TutoringSessionService.getTutorSessions(tutorId);
    if (!Array.isArray(sessions))
      return { weeklySessions: 0, weeklyEarnings: 0, studentRetention: 0 };

    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const endOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 6));

    const weeklySessions = sessions.filter((session) => {
      const sessionDate = new Date(session.date);
      return sessionDate >= startOfWeek && sessionDate <= endOfWeek;
    });

    const weeklyEarnings = weeklySessions.reduce((acc, session) => acc + (session.price || 0), 0);

    return { weeklySessions: weeklySessions.length, weeklyEarnings, studentRetention: 0 };
  },

  getTutorSessionStats: async (tutorId) => {
    const sessions = await TutoringSessionService.getTutorSessions(tutorId);
    if (!Array.isArray(sessions))
      return { total: 0, completed: 0, scheduled: 0, totalEarnings: 0, averageRating: 0 };

    const completed = sessions.filter((s) => s.status === 'completed');
    const scheduled = sessions.filter(
      (s) => s.status === 'scheduled' || s.status === 'pending'
    );
    const totalEarnings = completed.reduce((acc, s) => acc + (s.price || 0), 0);

    const ratedSessions = sessions.filter((s) => s.rating);
    const averageRating =
      ratedSessions.length > 0
        ? ratedSessions.reduce((acc, s) => acc + s.rating, 0) / ratedSessions.length
        : 0;

    return {
      total: sessions.length,
      completed: completed.length,
      scheduled: scheduled.length,
      totalEarnings,
      averageRating,
    };
  },

  canCancelSession: (session) => {
    if (!session || !session.scheduledStart) return false;
    const now = new Date();
    const sessionDate = new Date(session.scheduledStart);
    const diffInHours = (sessionDate - now) / (1000 * 60 * 60);
    if (diffInHours < 2) return false;
    return session.status !== 'cancelled' && session.status !== 'completed';
  },
};
