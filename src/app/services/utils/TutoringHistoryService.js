import { TutoringSessionService } from '../core/TutoringSessionService';

const TutoringHistoryService = {
  /**
   * Historial del estudiante vía JWT — usa /api/sessions?role=student (no rutas legacy tutoring-sessions).
   * @returns {Promise<{ sessions: Array }|[]>} Formato compatible: objeto con `sessions` o array vacío.
   */
  getStudentTutoringHistory: async () => {
    const apiSessions = await TutoringSessionService.getStudentSessions();
    if (!Array.isArray(apiSessions) || apiSessions.length === 0) {
      return { sessions: [] };
    }
    const sessions = apiSessions.map((s) => ({
      ...s,
      scheduledDateTime: s.startTimestamp ? new Date(s.startTimestamp) : null,
      endDateTime: s.endTimestamp ? new Date(s.endTimestamp) : null,
      tutorName: s.tutor?.name || s.tutor?.email || '',
    }));
    return { sessions };
  },

  getUniqueCourses: (sessions) => {
    if (!Array.isArray(sessions)) return [];
    const courses = sessions.map((s) => s.course).filter(Boolean);
    return [...new Set(courses)];
  },

  filterByDate: (sessions, startDate, endDate) => {
    if (!Array.isArray(sessions)) return [];
    return sessions.filter((session) => {
      if (!session.scheduledDateTime) return false;
      const sessionDate = new Date(session.scheduledDateTime);
      if (startDate && sessionDate < startDate) return false;
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        if (sessionDate > endOfDay) return false;
      }
      return true;
    });
  },

  formatDate: (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  },
};

export default TutoringHistoryService;
