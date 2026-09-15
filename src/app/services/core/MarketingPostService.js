/**
 * MarketingPostService
 *
 * Frontend service for the admin "Posts" library (Instagram posts published
 * from the content-creator tool). Read + delete only. Never throws on HTTP
 * errors — returns defaults instead.
 */

import { authFetch, authFetchBlob } from '../authFetch';

const API_BASE_URL = process.env.API_URL || '/api';

const postUrl = (slug) => `${API_BASE_URL}/admin/posts/${encodeURIComponent(slug)}`;

class MarketingPostServiceClass {
  /** @returns {Promise<{ success: boolean, posts: Array, error?: string }>} */
  async listPosts() {
    const { ok, data } = await authFetch(`${API_BASE_URL}/admin/posts`);
    if (ok && data?.success) return { success: true, posts: data.posts || [] };
    return { success: false, posts: [], error: data?.error };
  }

  /** @returns {Promise<{ success: boolean, post?: object, status?: number, error?: string }>} */
  async getPost(slug) {
    const { ok, status, data } = await authFetch(postUrl(slug));
    if (ok && data?.success) return { success: true, post: data.post };
    return { success: false, status, error: data?.error };
  }

  async deletePost(slug) {
    const { ok, data } = await authFetch(postUrl(slug), { method: 'DELETE' });
    if (ok && data?.success) return { success: true };
    return { success: false, error: data?.error || 'No se pudo eliminar el post' };
  }

  /**
   * Download one PNG through the authenticated proxy as a File, ready for
   * `navigator.share({ files })` or an object-URL download.
   * @returns {Promise<File|null>}
   */
  async fetchFile(slug, name) {
    const { ok, blob } = await authFetchBlob(
      `${postUrl(slug)}/files/${encodeURIComponent(name)}`,
    );
    if (!ok || !blob) return null;
    return new File([blob], `${slug}-${name}`, { type: 'image/png' });
  }
}

export const MarketingPostService = new MarketingPostServiceClass();
export default MarketingPostService;
