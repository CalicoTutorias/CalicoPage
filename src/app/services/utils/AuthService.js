import { signInWithEmailAndPassword, signInWithCustomToken, signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '../../../firebaseConfig';
import { API_URL } from '../../../config/api';

// Token storage key
const TOKEN_STORAGE_KEY = 'firebase_id_token';

/**
 * Token management utilities
 */
const TokenManager = {
  /**
   * Save token to localStorage
   */
  saveToken: (token) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    }
  },

  /**
   * Get token from localStorage
   */
  getToken: () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(TOKEN_STORAGE_KEY);
    }
    return null;
  },

  /**
   * Remove token from localStorage
   */
  removeToken: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  },

  /**
   * Get Authorization header value
   */
  getAuthHeader: () => {
    const token = TokenManager.getToken();
    return token ? `Bearer ${token}` : null;
  },
};

export const AuthService = {
  /**
   * Sign in with email and password using Firebase
   * Gets idToken and saves it for API calls
   */
  signIn: async (email, password) => {
    try {
      // Sign in with Firebase
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Get the ID token
      const idToken = await userCredential.user.getIdToken();
      
      // Save token to localStorage
      TokenManager.saveToken(idToken);
      
      return {
        success: true,
        user: {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
        },
      };
    } catch (error) {
      console.error('Error signing in:', error);
      return {
        success: false,
        error: error.message,
        code: error.code,
      };
    }
  },
  

  /**
   * Register new user
   * Backend creates Firebase Auth user and Firestore profile
   * Returns customToken which is used to sign in to Firebase
   * @param {Object} userData - { name, email, password, phone?, isTutor? }
   * @returns {Promise<Object>} { success, uid, customToken }
   */
  register: async (userData) => {
    try {
      const registerBody = {
        name: userData.name,
        email: userData.email,
        password: userData.password,
        phone: userData.phone || "",
        majorId: userData.major,
        isTutor: userData.isTutor || false,
      };
      
      console.log('Registering with payload:', registerBody);

      // Register with backend
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(registerBody),
      });

      if (!response.ok) {
        let errorData;
        const errorText = await response.text();
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          // If response is not JSON (e.g. 500 HTML page), use text
          errorData = { message: errorText || `HTTP Error ${response.status}` };
        }
        
        console.error('Registration failed. Status:', response.status, 'Error Data:', errorData);
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success || !data.customToken) {
        throw new Error('Registration failed: No custom token received');
      }

      // Use customToken to sign in to Firebase
      const userCredential = await signInWithCustomToken(auth, data.customToken);
      
      // Get the ID token
      const idToken = await userCredential.user.getIdToken();
      
      // Save token to localStorage
      TokenManager.saveToken(idToken);
      
      return {
        success: true,
        uid: data.uid,
        user: {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
        },
      };
    } catch (error) {
      console.error('Error registering user:', error);
      throw error;
    }
  },

  /**
   * Logout - clears Firebase session and removes token
   */
  logout: async () => {
    try {
      // Sign out from Firebase
      if (auth.currentUser) {
        await firebaseSignOut(auth);
      }
      
      // Remove token from storage
      TokenManager.removeToken();
      
      return { success: true };
    } catch (error) {
      console.error('Error signing out:', error);
      // Clear token anyway
      TokenManager.removeToken();
      return { success: false, error: error.message };
    }
  },

  /**
   * Sign out alias for backward compatibility
   */
  signOut: async () => {
    return AuthService.logout();
  },

  /**
   * Get current user from backend using stored token
   * Calls GET /users/me with Authorization: Bearer <idToken>
   * Automatically refreshes token if needed
   */
  me: async () => {
    try {
      // Try to get fresh token from Firebase if user is logged in
      let token = TokenManager.getToken();
      
      // If no token but user is logged in, get it from Firebase
      if (!token && auth.currentUser) {
        token = await auth.currentUser.getIdToken();
        TokenManager.saveToken(token);
      }
      
      if (!token) {
        return { success: false, error: 'No token available' };
      }

      // Use /api/users/:uid endpoint instead of /auth/me
      const baseUrl = API_URL;
      const uid = auth.currentUser?.uid;
      
      if (!uid) {
        console.error('[AuthService] No user UID available');
        return { success: false, error: 'No user authenticated' };
      }
      
      console.log(`[AuthService] Fetching user profile from: ${baseUrl}/users/${uid}`);

      try {
        const response = await fetch(`${baseUrl}/users/${uid}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            // Token expired, try to refresh it
            if (auth.currentUser) {
              try {
                console.log('[AuthService] Token expired, refreshing...');
                token = await auth.currentUser.getIdToken(true); // Force refresh
                TokenManager.saveToken(token);
                
                // Retry the request with new token
                const retryResponse = await fetch(`${baseUrl}/users/${uid}`, {
                  method: 'GET',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                  },
                });
                
                if (retryResponse.ok) {
                  const retryData = await retryResponse.json();
                  return retryData;
                }
              } catch (refreshError) {
                console.error('[AuthService] Error refreshing token:', refreshError);
              }
            }
            
            // If refresh failed, clear token
            TokenManager.removeToken();
          }
          
          // If user not found (404), use Firebase fallback
          if (response.status === 404) {
            console.warn('[AuthService] User not found in database, using Firebase data');
            if (auth.currentUser) {
              return {
                success: true,
                user: {
                  uid: auth.currentUser.uid,
                  email: auth.currentUser.email,
                  name: auth.currentUser.displayName || auth.currentUser.email.split('@')[0],
                  isTutor: false,
                  profile: {
                    name: auth.currentUser.displayName,
                    email: auth.currentUser.email
                  }
                }
              };
            }
          }
          
          const errorText = await response.text();
          throw new Error(errorText || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
      } catch (fetchError) {
        console.error('[AuthService] Network error in me():', fetchError);
        
        // FALLBACK: Si el backend falla, usamos los datos de Firebase para permitir el login
        if (auth.currentUser) {
          console.warn('[AuthService] Using Firebase fallback data due to backend error');
          return {
            success: true,
            user: {
              uid: auth.currentUser.uid,
              email: auth.currentUser.email,
              name: auth.currentUser.displayName || auth.currentUser.email.split('@')[0],
              isTutor: false, // Por defecto asumimos estudiante si no hay backend
              profile: {
                name: auth.currentUser.displayName,
                email: auth.currentUser.email
              }
            }
          };
        }
        
        return { success: false, error: 'Network error connecting to server.' };
      }
    } catch (error) {
      console.error('[AuthService] Unexpected error in me():', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Update user role
   */
  updateRole: async (uid, newRole) => {
    const token = TokenManager.getToken();
    const response = await fetch(`${API_URL}/user/${uid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ role: newRole })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  },

  /**
   * Get majors
   */
  getMajors: async () => {
    const token = TokenManager.getToken();
    const response = await fetch(`${API_URL}/majors`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  },

  /**
   * Get current token (useful for manual API calls)
   */
  getToken: () => {
    return TokenManager.getToken();
  },

  /**
   * Refresh the Firebase token (useful when token expires)
   */
  refreshToken: async () => {
    try {
      if (!auth.currentUser) {
        throw new Error('No user logged in');
      }
      
      const idToken = await auth.currentUser.getIdToken(true); // Force refresh
      TokenManager.saveToken(idToken);
      
      return { success: true, token: idToken };
    } catch (error) {
      console.error('Error refreshing token:', error);
      return { success: false, error: error.message };
    }
  },
};
