/**
 * SessionInvitationService — frontend
 *
 * Invitations to group tutoring sessions. Every call goes through authFetch
 * and never throws: failures come back as `{ success: false, code }`, where
 * `code` is the server's refusal (e.g. SESSION_FULL) for the UI to translate.
 *
 * Backend:
 *   GET    /api/session-invitations                          my pending invitations
 *   GET    /api/session-invitations/:key                     preview (token or id)
 *   POST   /api/session-invitations/:key/accept
 *   POST   /api/session-invitations/:key/decline
 *   GET    /api/sessions/:id/invitations                     seats + invitations
 *   POST   /api/sessions/:id/invitations                     { email }
 *   DELETE /api/sessions/:id/invitations/:invitationId
 *   POST   /api/sessions/:id/invitations/:invitationId/resend
 *   POST   /api/sessions/:id/leave
 */

import { authFetch } from '../authFetch';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

/**
 * Same-origin fetch for the two calls a visitor WITHOUT a session makes
 * (preview and decline). authFetch would treat their 401 as an expired
 * session and bounce the visitor to login; here it is just an answer. The
 * HttpOnly session cookie still travels when there is one.
 */
async function publicFetch(url, options = {}) {
  try {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function failure(status, data) {
  return {
    success: false,
    status,
    code: status === 429 && !data?.error ? 'RATE_LIMITED' : data?.error || 'INTERNAL_ERROR',
  };
}

class SessionInvitationServiceClass {
  async listMine() {
    const { ok, data } = await authFetch(`${API_BASE_URL}/session-invitations`);
    return ok && data?.success ? data.invitations || [] : [];
  }

  async preview(key) {
    const { ok, status, data } = await publicFetch(`${API_BASE_URL}/session-invitations/${encodeURIComponent(key)}`);
    if (ok && data?.success) return { success: true, invitation: data.invitation, isLoggedIn: Boolean(data.isLoggedIn) };
    return failure(status, data);
  }

  async accept(key) {
    const { ok, status, data } = await authFetch(`${API_BASE_URL}/session-invitations/${encodeURIComponent(key)}/accept`, {
      method: 'POST',
    });
    if (ok && data?.success) return { success: true, session: data.session, alreadyJoined: Boolean(data.alreadyJoined) };
    return failure(status, data);
  }

  async decline(key) {
    const { ok, status, data } = await publicFetch(`${API_BASE_URL}/session-invitations/${encodeURIComponent(key)}/decline`, {
      method: 'POST',
    });
    return ok && data?.success ? { success: true } : failure(status, data);
  }

  async listForSession(sessionId) {
    const { ok, status, data } = await authFetch(`${API_BASE_URL}/sessions/${sessionId}/invitations`);
    if (ok && data?.success) {
      return { success: true, seats: data.seats, canManage: Boolean(data.canManage), invitations: data.invitations || [] };
    }
    return failure(status, data);
  }

  async invite(sessionId, email) {
    const { ok, status, data } = await authFetch(`${API_BASE_URL}/sessions/${sessionId}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    if (ok && data?.success) return { success: true, invitation: data.invitation, emailSent: Boolean(data.emailSent) };
    return failure(status, data);
  }

  async revoke(sessionId, invitationId) {
    const { ok, status, data } = await authFetch(`${API_BASE_URL}/sessions/${sessionId}/invitations/${invitationId}`, {
      method: 'DELETE',
    });
    return ok && data?.success ? { success: true } : failure(status, data);
  }

  async resend(sessionId, invitationId) {
    const { ok, status, data } = await authFetch(`${API_BASE_URL}/sessions/${sessionId}/invitations/${invitationId}/resend`, {
      method: 'POST',
    });
    return ok && data?.success ? { success: true } : failure(status, data);
  }

  async leave(sessionId) {
    const { ok, status, data } = await authFetch(`${API_BASE_URL}/sessions/${sessionId}/leave`, { method: 'POST' });
    return ok && data?.success ? { success: true } : failure(status, data);
  }
}

export const SessionInvitationService = new SessionInvitationServiceClass();

export default SessionInvitationService;
