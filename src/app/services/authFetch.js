/**
 * Authenticated fetch wrapper
 * Automatically injects the JWT token as Authorization header
 * and handles errors gracefully (never throws on HTTP errors).
 */

const TOKEN_KEY = 'calico_auth_token';

/**
 * Fired on `window` when an authenticated call answers 401: the HttpOnly
 * session cookie is gone or invalid while the UI may still show the user as
 * logged in. The auth context listens and sends the user to the login page
 * with a "session expired" notice instead of letting every screen surface
 * the raw server error (e.g. next to an uploaded file).
 */
export const SESSION_EXPIRED_EVENT = 'calico:session-expired';

/** Endpoints where a 401 is a normal answer, not an expired session. */
const AUTH_ENDPOINTS = ['/api/auth/me', '/api/auth/login', '/api/auth/google', '/api/auth/logout'];

function notifySessionExpired(url) {
  if (typeof window === 'undefined') return;
  const path = String(url);
  if (AUTH_ENDPOINTS.some((p) => path.includes(p))) return;
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { url: path } }));
}

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

    if (response.status === 401) notifySessionExpired(url);

    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    console.error(`[authFetch] Network error for ${url}:`, error.message);
    return { ok: false, status: 0, data: null };
  }
}

/**
 * Authenticated fetch for binary responses (images, files).
 * Returns { ok, status, blob } — never throws on HTTP errors.
 *
 * @param {string} url
 * @returns {Promise<{ ok: boolean, status: number, blob: Blob|null }>}
 */
export async function authFetchBlob(url) {
  const token = getToken();
  try {
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (response.status === 401) notifySessionExpired(url);
    if (!response.ok) return { ok: false, status: response.status, blob: null };
    return { ok: true, status: response.status, blob: await response.blob() };
  } catch (error) {
    console.error(`[authFetchBlob] Network error for ${url}:`, error.message);
    return { ok: false, status: 0, blob: null };
  }
}

/**
 * Variante para endpoints públicos (GET sin auth: catálogo de materias,
 * carreras, noticias). Devuelve la misma forma `{ ok, status, data }` que
 * `authFetch`, pero NO envía `Authorization`: la CDN de Vercel nunca cachea
 * peticiones con esa cabecera, así que con `authFetch` cada visita volvía a
 * invocar la función aunque la ruta ya respondiera con `s-maxage`.
 */
export async function publicFetch(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  try {
    const response = await fetch(url, { ...options, headers });
    let data = null;
    try {
      data = await response.json();
    } catch {
      // body vacío o no JSON
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    console.error(`[publicFetch] Network error for ${url}:`, error.message);
    return { ok: false, status: 0, data: null };
  }
}
