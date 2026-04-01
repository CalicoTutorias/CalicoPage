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

    TokenManager.saveToken(data.token);

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
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || `Registration failed (${response.status})`);
    }

    TokenManager.saveToken(data.token);

    return {
      success: true,
      user: data.user,
    };
  },

  /**
   * Logout — clears the JWT from localStorage.
   */
  logout: async () => {
    TokenManager.removeToken();
    return { success: true };
  },

  signOut: async () => AuthService.logout(),

  /**
   * Get the authenticated user's profile.
   * Calls GET /api/auth/me with the stored JWT.
   */
  me: async () => {
    const token = TokenManager.getToken();
    if (!token) {
      return { success: false, error: 'No token available' };
    }

    const response = await authFetch(`${API_URL}/auth/me`);

    if (!response.ok) {
      if (response.status === 401) {
        TokenManager.removeToken();
      }
      return { success: false, error: `Server error: ${response.status}` };
    }

    return response.json();
  },

  // ---------------------------------------------------------------------------
  // Email verification
  // ---------------------------------------------------------------------------

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
