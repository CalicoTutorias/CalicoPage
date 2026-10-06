/**
 * EventService — frontend
 *
 * Public event listing/detail, registration, checkout, cancellation, survey,
 * and the "my events" / tutor views. Every method resolves to
 * `{ success, ...data, error?, status? }` and never throws.
 *
 * Backend: /api/events, /api/events/:slug/{register,checkout,cancel-registration,survey},
 *          /api/payments/confirm-payment, /api/me/events, /api/me/pending-feedback,
 *          /api/tutor/events
 */

import { authFetch, publicFetch } from '../authFetch';

const API_BASE_URL = process.env.API_URL || '/api';

const post = (url, body) => authFetch(url, { method: 'POST', body: JSON.stringify(body ?? {}) });

/** Map a fetch result to `{ success, ...picked fields }` or an error shape. */
function shape({ ok, status, data }, fields = []) {
  if (ok && data?.success) {
    const out = { success: true };
    for (const f of fields) out[f] = data[f];
    return out;
  }
  return {
    success: false,
    error: data?.error || null,
    code: data?.code,
    rule: data?.rule,
    field: data?.field,
    status,
  };
}

class EventServiceClass {
  async listPublic() {
    return shape(await publicFetch(`${API_BASE_URL}/events`), ['events']);
  }

  async getBySlug(slug) {
    return shape(await authFetch(`${API_BASE_URL}/events/${encodeURIComponent(slug)}`), [
      'event',
      'myRegistration',
    ]);
  }

  async register(slug, { source, marketingOptIn } = {}) {
    return shape(
      await post(`${API_BASE_URL}/events/${encodeURIComponent(slug)}/register`, { source, marketingOptIn }),
      ['registration'],
    );
  }

  async startCheckout(slug, { source, marketingOptIn } = {}) {
    return shape(
      await post(`${API_BASE_URL}/events/${encodeURIComponent(slug)}/checkout`, { source, marketingOptIn }),
      ['checkout'],
    );
  }

  async confirmPayment({ reference, transactionId }) {
    return shape(
      await post(`${API_BASE_URL}/payments/confirm-payment`, {
        reference,
        transactionData: { id: transactionId },
      }),
      ['result'],
    );
  }

  async cancelRegistration(slug, { refundMethod, refundMethodDetails } = {}) {
    return shape(
      await post(`${API_BASE_URL}/events/${encodeURIComponent(slug)}/cancel-registration`, {
        refundMethod,
        refundMethodDetails,
      }),
      ['refundable'],
    );
  }

  async submitSurvey(slug, payload) {
    return shape(await post(`${API_BASE_URL}/events/${encodeURIComponent(slug)}/survey`, payload));
  }

  async getMyEvents() {
    return shape(await authFetch(`${API_BASE_URL}/me/events`), ['registrations']);
  }

  async getPendingFeedback() {
    return shape(await authFetch(`${API_BASE_URL}/me/pending-feedback`), ['item']);
  }

  async getTutorEvents() {
    return shape(await authFetch(`${API_BASE_URL}/tutor/events`), ['events']);
  }
}

export const EventService = new EventServiceClass();
export default EventService;
