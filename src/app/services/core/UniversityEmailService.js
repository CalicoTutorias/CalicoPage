/**
 * UniversityEmailService
 *
 * The caller's university email (the "verified Uniandes" badge).
 * Never throws: every method returns { ok, status, code?, error?, ... }.
 */

import { authFetch } from '../authFetch';

const API_BASE_URL = process.env.API_URL || '/api';
const ME_URL = `${API_BASE_URL}/users/me/university-email`;

const result = ({ ok, status, data }) => ({
  ok: ok && Boolean(data?.success),
  httpStatus: status,
  status: data?.status ?? null,
  code: data?.code ?? null,
  error: data?.error ?? null,
  retryAfterSeconds: data?.retryAfterSeconds ?? null,
});

class UniversityEmailServiceClass {
  /** Current verified email, badge and pending verification. */
  async getStatus() {
    return result(await authFetch(ME_URL));
  }

  /** Email a verification link to `email`. */
  async requestVerification(email) {
    return result(await authFetch(ME_URL, { method: 'POST', body: JSON.stringify({ email }) }));
  }

  /** Remove the university email and the badge. */
  async remove() {
    return result(await authFetch(ME_URL, { method: 'DELETE' }));
  }

  /**
   * Confirm the emailed link. Needs no session (the link may be opened on
   * another device). status: 'success' | 'invalid' | 'expired' | 'taken' | 'unsupported' | 'error'
   */
  async verify(token) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify-university-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => ({}));
      return { status: data.status || 'error', university: data.university ?? null };
    } catch {
      return { status: 'error', university: null };
    }
  }
}

export const UniversityEmailService = new UniversityEmailServiceClass();
