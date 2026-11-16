/**
 * SessionMaterialService — frontend
 *
 * Study material of a tutoring session: the tutor and admins add it, and the
 * student downloads it after leaving a review with a comment (the server enforces
 * who may do what). All calls go through authFetch except the PUT to S3.
 *
 * Backend:
 *   GET    /api/sessions/:id/materials
 *   POST   /api/sessions/:id/materials
 *   POST   /api/sessions/:id/materials/presigned-url
 *   DELETE /api/sessions/:id/materials/:materialId
 *   GET    /api/sessions/:id/materials/:materialId/download
 */

import { authFetch } from '../authFetch';

const API_BASE_URL = process.env.API_URL || '/api';
const baseUrl = (sessionId) => `${API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}/materials`;

class SessionMaterialServiceClass {
  async list(sessionId) {
    const { ok, status, data } = await authFetch(baseUrl(sessionId));
    return { ok, status, ...(data || {}) };
  }

  /** Presign -> PUT to S3 -> register. */
  async upload(sessionId, file) {
    const presign = await authFetch(`${baseUrl(sessionId)}/presigned-url`, {
      method: 'POST',
      body: JSON.stringify({ fileName: file.name, fileSize: file.size }),
    });
    if (!presign.ok || !presign.data?.success) {
      return { ok: false, status: presign.status, ...(presign.data || {}) };
    }

    const { uploadUrl, s3Key, contentType } = presign.data;
    try {
      const s3Res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType, 'x-amz-tagging': 'status=unconfirmed' },
        body: file,
      });
      if (!s3Res.ok) return { ok: false, status: s3Res.status, error: 'UPLOAD_FAILED' };
    } catch {
      return { ok: false, error: 'UPLOAD_FAILED' };
    }

    const { ok, status, data } = await authFetch(baseUrl(sessionId), {
      method: 'POST',
      body: JSON.stringify({ s3Key, fileName: file.name }),
    });
    return { ok, status, ...(data || {}) };
  }

  async remove(sessionId, materialId) {
    const { ok, status, data } = await authFetch(`${baseUrl(sessionId)}/${encodeURIComponent(materialId)}`, {
      method: 'DELETE',
    });
    return { ok, status, ...(data || {}) };
  }

  async getDownloadUrl(sessionId, materialId) {
    const { ok, status, data } = await authFetch(`${baseUrl(sessionId)}/${encodeURIComponent(materialId)}/download`);
    return { ok, status, ...(data || {}) };
  }
}

export const SessionMaterialService = new SessionMaterialServiceClass();
export default SessionMaterialService;
