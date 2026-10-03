/**
 * AdminEventService — frontend
 *
 * Admin CRUD and operations for events. Every method resolves to
 * `{ success, ...data, error, code, rule, field }` and never throws.
 *
 * Backend: /api/admin/events[/:id[/...]], /api/admin/events/image/presigned-url
 */

import { authFetch, authFetchBlob } from '../authFetch';

const API_BASE_URL = process.env.API_URL || '/api';
const BASE = `${API_BASE_URL}/admin/events`;

const send = (url, method, body) =>
  authFetch(url, { method, ...(body !== undefined && { body: JSON.stringify(body) }) });

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

class AdminEventServiceClass {
  async list(filter) {
    const qs = filter ? `?filter=${encodeURIComponent(filter)}` : '';
    return shape(await authFetch(`${BASE}${qs}`), ['events']);
  }

  async get(id) {
    return shape(await authFetch(`${BASE}/${id}`), ['event', 'calendarWarning']);
  }

  async create(payload) {
    return shape(await send(BASE, 'POST', payload), ['event']);
  }

  async update(id, payload) {
    return shape(await send(`${BASE}/${id}`, 'PATCH', payload), ['event', 'calendarWarning']);
  }

  async remove(id) {
    return shape(await send(`${BASE}/${id}`, 'DELETE'));
  }

  async publish(id) {
    return shape(await send(`${BASE}/${id}/publish`, 'POST'), ['event']);
  }

  async cancel(id, reason) {
    return shape(await send(`${BASE}/${id}/cancel`, 'POST', { reason }), ['event']);
  }

  async remind(id) {
    return shape(await send(`${BASE}/${id}/remind`, 'POST'), ['sent', 'failed']);
  }

  async surveyReminder(id) {
    return shape(await send(`${BASE}/${id}/survey-reminder`, 'POST'), ['sent', 'failed', 'skipped']);
  }

  async registrations(id) {
    return shape(await authFetch(`${BASE}/${id}/registrations`), ['registrations']);
  }

  /** Download the registrations CSV through a temporary <a download>. */
  async downloadRegistrationsCsv(id, slug) {
    const { ok, status, blob } = await authFetchBlob(`${BASE}/${id}/registrations?format=csv`);
    if (!ok || !blob) return { success: false, error: null, status };
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug || id}-inscritos.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { success: true };
  }

  async payments(id) {
    return shape(await authFetch(`${BASE}/${id}/payments`), ['payments', 'totals']);
  }

  async markRefunded(id, paymentId) {
    return shape(await send(`${BASE}/${id}/payments/${paymentId}/refunded`, 'POST'), ['payment']);
  }

  async survey(id) {
    return shape(await authFetch(`${BASE}/${id}/survey`), ['results']);
  }

  async tutorPayouts(id) {
    return shape(await authFetch(`${BASE}/${id}/tutor-payouts`), ['payouts']);
  }

  async createTutorPayout(id, payload) {
    return shape(await send(`${BASE}/${id}/tutor-payouts`, 'POST', payload), ['payout']);
  }

  /** Presign -> PUT to S3 (same flow as NewsService.uploadNewsImage). */
  async uploadCover(file) {
    if (!file) return { success: false, error: 'No se seleccionó archivo' };

    const presign = await send(`${BASE}/image/presigned-url`, 'POST', {
      mimeType: file.type,
      fileSize: file.size,
    });
    if (!presign.ok || !presign.data?.success) {
      return shape(presign);
    }

    const { uploadUrl, s3Key } = presign.data;
    try {
      const s3Res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
          'x-amz-tagging': 'status=unconfirmed',
        },
        body: file,
      });
      if (!s3Res.ok) {
        return { success: false, error: `La subida a S3 falló (${s3Res.status})` };
      }
    } catch (err) {
      return { success: false, error: err.message || 'Error de red al subir' };
    }

    return { success: true, s3Key };
  }
}

export const AdminEventService = new AdminEventServiceClass();
export default AdminEventService;
