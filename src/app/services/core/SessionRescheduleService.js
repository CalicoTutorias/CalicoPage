/**
 * SessionRescheduleService — frontend
 *
 * Moving a session to another time by agreement: the tutor or the student who
 * booked proposes, the other one accepts or declines. Every call goes through
 * authFetch and never throws: failures come back as `{ success: false, code }`,
 * where `code` is the server's refusal (e.g. SESSION_CONFLICT) for the UI to
 * translate.
 *
 * Backend:
 *   GET    /api/reschedule-requests                                    waiting for my answer
 *   GET    /api/sessions/:id/reschedule-requests                       open proposal + canPropose
 *   POST   /api/sessions/:id/reschedule-requests                       { startTimestamp, message? }
 *   POST   /api/sessions/:id/reschedule-requests/:requestId/accept
 *   POST   /api/sessions/:id/reschedule-requests/:requestId/decline
 *   DELETE /api/sessions/:id/reschedule-requests/:requestId            withdraw
 */

import { authFetch } from '../authFetch';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

function failure(status, data) {
  return {
    success: false,
    status,
    code: status === 429 && !data?.error ? 'RATE_LIMITED' : data?.error || 'INTERNAL_ERROR',
  };
}

class SessionRescheduleServiceClass {
  async listMine() {
    const { ok, data } = await authFetch(`${API_BASE_URL}/reschedule-requests`);
    return ok && data?.success ? data.requests || [] : [];
  }

  async getForSession(sessionId) {
    const { ok, status, data } = await authFetch(`${API_BASE_URL}/sessions/${sessionId}/reschedule-requests`);
    if (ok && data?.success) {
      return { success: true, request: data.request ?? null, canPropose: Boolean(data.canPropose), role: data.role };
    }
    return failure(status, data);
  }

  /** @param {Date} start */
  async propose(sessionId, start, message = '') {
    const { ok, status, data } = await authFetch(`${API_BASE_URL}/sessions/${sessionId}/reschedule-requests`, {
      method: 'POST',
      body: JSON.stringify({ startTimestamp: start.toISOString(), message: message || null }),
    });
    if (ok && data?.success) return { success: true, request: data.request, emailSent: Boolean(data.emailSent) };
    return failure(status, data);
  }

  async accept(sessionId, requestId) {
    const { ok, status, data } = await authFetch(
      `${API_BASE_URL}/sessions/${sessionId}/reschedule-requests/${requestId}/accept`,
      { method: 'POST' },
    );
    if (ok && data?.success) return { success: true, session: data.session, calendar: data.calendar };
    return failure(status, data);
  }

  async decline(sessionId, requestId) {
    const { ok, status, data } = await authFetch(
      `${API_BASE_URL}/sessions/${sessionId}/reschedule-requests/${requestId}/decline`,
      { method: 'POST' },
    );
    return ok && data?.success ? { success: true } : failure(status, data);
  }

  async withdraw(sessionId, requestId) {
    const { ok, status, data } = await authFetch(
      `${API_BASE_URL}/sessions/${sessionId}/reschedule-requests/${requestId}`,
      { method: 'DELETE' },
    );
    return ok && data?.success ? { success: true } : failure(status, data);
  }
}

export const SessionRescheduleService = new SessionRescheduleServiceClass();

export default SessionRescheduleService;
