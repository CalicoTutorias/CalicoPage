import { API_URL } from '../../../config/api';

// Token storage key
const TOKEN_KEY = 'calico_auth_token';

/**
 * Token management utilities
 */
const TokenManager = {
  saveToken: (token) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, token);
    }
  },

  getToken: () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(TOKEN_KEY);
    }
    return null;
  },

  removeToken: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
    }
  },

  getAuthHeader: () => {
    const token = TokenManager.getToken();
    return token ? `Bearer ${token}` : null;
  },
};

/**
 * Helper for authenticated fetch calls.
 */
async function authFetch(url, options = {}) {
  const token = TokenManager.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  return fetch(url, { ...options, headers });
}

export const AuthService = {
  // ---------------------------------------------------------------------------
  // Core auth
  // ---------------------------------------------------------------------------

  /**
   * Login with email and password.
   * Calls POST /api/auth/login, saves JWT on success.
   */
  signIn: async (email, password) => {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'Login failed',
        email: data.email,
        status: response.status,
      };
    }

    // Token stored in HttpOnly cookie by the server — do NOT persist in localStorage.
    // Clear any stale localStorage token (same reason as signInWithGoogle above).
    TokenManager.removeToken();

    return {
      success: true,
      user: data.user,
    };
  },

  /**
   * Register a new user.
   * Calls POST /api/auth/register, saves JWT on success.
   */
  register: async (userData) => {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: userData.name,
        email: userData.email,
        password: userData.password,
        phoneNumber: userData.phone || '',
        careerId: userData.careerId || null,
        terms: userData.terms === true,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || `Registration failed (${response.status})`);
    }

    // Do NOT save the JWT here — the user must verify their email before
    // being considered authenticated. Login after verification handles this.

    return {
      success: true,
      user: data.user,
      resent: data.resent ?? false,
    };
  },

  /**
   * Logout — clears the HttpOnly cookie server-side and any residual localStorage token.
   */
  logout: async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, { method: 'POST' });
    } catch {
      // Ignore network errors; local cleanup still proceeds.
    }
    TokenManager.removeToken();
    return { success: true };
  },

  signOut: async () => AuthService.logout(),

  /**
   * Sign in with Google.
   * Calls POST /api/auth/google with Google ID token, saves JWT on success.
   */
  signInWithGoogle: async (idToken) => {
    const response = await fetch(`${API_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'Google sign-in failed',
        status: response.status,
      };
    }

    // Token stored in HttpOnly cookie by the server — do NOT persist in localStorage.
    // Clear any stale localStorage token so subsequent authFetch calls use the
    // new HttpOnly cookie instead of an old bearer token that may point to a
    // deleted or different user (causes 404 on /api/auth/me).
    TokenManager.removeToken();

    return {
      success: true,
      user: data.user,
      isNewUser: data.isNewUser || false,
      linked: data.linked || false,
    };
  },

  /**
   * Get the authenticated user's profile.
   * Calls GET /api/auth/me with the stored JWT.
   */
  me: async () => {
    // No localStorage pre-check — auth is now carried by the HttpOnly cookie.
    // The server returns 401 when no valid session exists.
    const response = await authFetch(`${API_URL}/auth/me`);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        // 404 = user referenced by localStorage token no longer exists in DB.
        TokenManager.removeToken();
      }
      return { success: false, error: `Server error: ${response.status}` };
    }

    return response.json();
  },

  // ---------------------------------------------------------------------------
  // Email verification
  // ---------------------------------------------------------------------------

  /**
   * Confirm an email verification token (explicit user action → POST).
   * Returns { status } where status is one of:
   * 'success' | 'already' | 'expired' | 'invalid' | 'error'.
   */
  verifyEmail: async (token) => {
    try {
      const response = await fetch(`${API_URL}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => ({}));
      return { status: data.status || 'error' };
    } catch {
      return { status: 'error' };
    }
  },

  checkVerification: async (email) => {
    const response = await fetch(
      `${API_URL}/auth/check-verification?email=${encodeURIComponent(email)}`,
    );
    if (!response.ok) throw new Error('Verification check failed');
    return response.json();
  },

  resendVerificationEmail: async (email) => {
    const response = await fetch(`${API_URL}/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to resend verification email');
    }
    return response.json();
  },

  // ---------------------------------------------------------------------------
  // Password recovery
  // ---------------------------------------------------------------------------

  forgotPassword: async (email) => {
    const response = await fetch(`${API_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await response.json().catch(() => ({}));
    return data;
  },

  resetPassword: async (token, newPassword) => {
    const response = await fetch(`${API_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Password reset failed');
    }
    return data;
  },

  // ---------------------------------------------------------------------------
  // Change password (authenticated)
  // ---------------------------------------------------------------------------

  changePassword: async (currentPassword, newPassword) => {
    const response = await authFetch(`${API_URL}/auth/change-password`, {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Password change failed');
    }
    return data;
  },

  // ---------------------------------------------------------------------------
  // Token utilities
  // ---------------------------------------------------------------------------

  getToken: () => TokenManager.getToken(),
};
