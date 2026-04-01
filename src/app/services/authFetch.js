/**
 * Authenticated fetch wrapper
 * Automatically injects the JWT token as Authorization header
 * and handles errors gracefully (never throws on HTTP errors).
 */

const TOKEN_KEY = 'calico_auth_token';

/**
 * Get the current auth token from localStorage.
 */
function getToken() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(TOKEN_KEY);
  }
  return null;
}

/**
 * Fetch with automatic auth token injection.
 * Returns { ok, status, data } — never throws on HTTP errors.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<{ ok: boolean, status: number, data: any }>}
 */
export async function authFetch(url, options = {}) {
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Remove Content-Type for FormData (browser sets it with boundary)
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      // Response body is not JSON — that's ok
    }

    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    console.error(`[authFetch] Network error for ${url}:`, error.message);
    return { ok: false, status: 0, data: null };
  }
}
