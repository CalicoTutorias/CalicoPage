/**
 * NewsService
 *
 * Frontend service for the news/announcements domain.
 * Public feed uses plain fetch (the landing has no token); admin operations
 * use authFetch. Never throws on HTTP errors — returns defaults instead.
 */

import { authFetch } from '../authFetch';

const API_BASE_URL = process.env.API_URL || '/api';

class NewsServiceClass {
  /**
   * Published posts for the public feed (landing / homes).
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async getPublishedNews(limit = 6) {
    try {
      const res = await fetch(`${API_BASE_URL}/news?limit=${encodeURIComponent(limit)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data?.success && Array.isArray(data.posts) ? data.posts : [];
    } catch {
      return [];
    }
  }

  // ===== Admin =====

  /**
   * Full editorial list (drafts included).
   * @returns {Promise<{ success: boolean, posts: Array, total: number }>}
   */
  async listAllNews({ limit = 50, offset = 0 } = {}) {
    const { ok, data } = await authFetch(
      `${API_BASE_URL}/admin/news?limit=${limit}&offset=${offset}`,
    );
    if (ok && data?.success) {
      return { success: true, posts: data.posts || [], total: data.total || 0 };
    }
    return { success: false, posts: [], total: 0, error: data?.error };
  }

  /**
   * @param {{ title, content, imageS3Key?, isPublished?, isPinned? }} payload
   */
  async createNews(payload) {
    const { ok, data } = await authFetch(`${API_BASE_URL}/admin/news`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (ok && data?.success) return { success: true, post: data.post };
    return { success: false, error: data?.error || 'No se pudo crear la publicación' };
  }

  /**
   * Partial update. `imageS3Key`: omit = untouched, null = remove, string = replace.
   */
  async updateNews(id, payload) {
    const { ok, data } = await authFetch(
      `${API_BASE_URL}/admin/news/${encodeURIComponent(id)}`,
      { method: 'PUT', body: JSON.stringify(payload) },
    );
    if (ok && data?.success) return { success: true, post: data.post };
    return { success: false, error: data?.error || 'No se pudo actualizar la publicación' };
  }

  async deleteNews(id) {
    const { ok, data } = await authFetch(
      `${API_BASE_URL}/admin/news/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
    if (ok && data?.success) return { success: true };
    return { success: false, error: data?.error || 'No se pudo eliminar la publicación' };
  }

  /**
   * Upload a news image: presign → PUT straight to S3.
   * Returns the s3Key to attach on create/update.
   *
   * @param {File} file
   * @returns {Promise<{ success: boolean, s3Key?: string, error?: string }>}
   */
  async uploadNewsImage(file) {
    if (!file) return { success: false, error: 'No se seleccionó archivo' };

    const presign = await authFetch(`${API_BASE_URL}/admin/news/image/presigned-url`, {
      method: 'POST',
      body: JSON.stringify({ mimeType: file.type, fileSize: file.size }),
    });

    if (!presign.ok || !presign.data?.success) {
      return {
        success: false,
        error: presign.data?.error || 'No se pudo iniciar la subida',
      };
    }

    const { uploadUrl, s3Key } = presign.data;

    // The presigned URL has ContentLength and the `status=unconfirmed` tag
    // baked into the signature, so both must be sent verbatim.
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

export const NewsService = new NewsServiceClass();
export default NewsService;
