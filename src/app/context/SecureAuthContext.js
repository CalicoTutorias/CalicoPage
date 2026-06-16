'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { AuthService } from '../services/utils/AuthService';

const SecureAuthContext = createContext();

export const useAuth = () => {
  const context = useContext(SecureAuthContext);
  if (!context) throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  return context;
};

const EMPTY_USER = {
  isLoggedIn: false,
  email: '',
  name: '',
  phone: '',
  isTutor: false,
  isTutorRequested: false,
  isTutorApproved: false,
  isAdmin: false,
  tutorApplicationStatus: null,
  // `role` is the legacy "view role" string consumed across the UI
  // (Student | Tutor). It mirrors the active mode, NOT the DB enum.
  // The DB enum value (STUDENT | ADMIN) is exposed as `roleDb` so admin
  // guards can check it without colliding with the existing UI logic.
  role: 'Student',
  roleDb: 'STUDENT',
  uid: null,
  tutorProfile: null,
  careerId: null,
  career: null,
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(EMPTY_USER);
  const [loading, setLoading] = useState(true);

  /**
   * Load user profile from /api/auth/me using the stored JWT.
   */
  const loadMe = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AuthService.me();
      if (res?.success && res.user) {
        const u = res.user;
        const dbRole = u.role || 'STUDENT';
        setUser({
          isLoggedIn: true,
          email: u.email || '',
          name: u.name || '',
          phone: u.phoneNumber || '',
          profilePictureUrl: u.profilePictureUrl || null,
          isTutor: !!u.isTutorApproved,
          isTutorRequested: !!u.isTutorRequested,
          isTutorApproved: !!u.isTutorApproved,
          isAdmin: dbRole === 'ADMIN',
          tutorApplicationStatus: u.tutorApplicationStatus ?? null,
          role: u.isTutorApproved ? 'Tutor' : 'Student',
          roleDb: dbRole,
          uid: u.id || null,
          // The API (/api/auth/me) returns camelCase `careerId` plus the
          // hydrated `career` relation. The old code read `career_id`, which
          // never existed on the payload, so career stayed null everywhere
          // (e.g. the profile page's career name). Map both correctly.
          careerId: u.careerId ?? null,
          career: u.career ?? null,
          tutorProfile: u.tutorProfile || null,
        });
        return true;
      } else {
        setUser(EMPTY_USER);
        return false;
      }
    } catch (err) {
      console.error('Error loading user:', err);
      setUser(EMPTY_USER);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * On mount: always call /api/auth/me to restore session from the HttpOnly cookie.
   * The server returns 401 when no valid session exists; loadMe handles that gracefully.
   */
  useEffect(() => {
    loadMe();
  }, [loadMe]);

  /**
   * Login: call the backend, save token, then load user profile.
   */
  const login = useCallback(async ({ email, password }) => {
    const result = await AuthService.signIn(email, password);
    if (result.success) {
      await loadMe();
    }
    return result;
  }, [loadMe]);

  /**
   * Logout: clear token and reset user state.
   */
  const logout = useCallback(async () => {
    await AuthService.signOut();
    setUser(EMPTY_USER);
  }, []);

  const loginGoogle = useCallback(async (idToken) => {
    try {
      const result = await AuthService.signInWithGoogle(idToken);
      if (!result.success) return result;

      // loadMe validates the session cookie and sets the user state.
      // If it returns false (server rejected /api/auth/me), report failure so
      // the caller does NOT redirect — the user stays on the login page with
      // an error instead of seeing an "access restricted" home page.
      const sessionOk = await loadMe();
      if (!sessionOk) {
        return { success: false, error: 'Autenticación con Google exitosa, pero no se pudo iniciar la sesión. Intenta de nuevo.' };
      }

      return result;
    } catch (error) {
      console.error('Google login error:', error);
      return { success: false, error: error.message || 'Google login failed' };
    }
  }, [loadMe]);

  /**
   * Refresh user data from the server.
   */
  const refreshUserData = useCallback(async () => {
    await loadMe();
  }, [loadMe]);

  /**
   * Patch a single field on the in-memory user without re-fetching from the
   * server. Use this when a write to the backend already returned the new
   * value and you just want to propagate it through the app without
   * triggering the full-page `loading` state that `refreshUserData` causes
   * (e.g. after uploading a profile picture).
   *
   * @param {string} field
   * @param {*} value
   */
  const setUserField = useCallback((field, value) => {
    setUser((prev) => ({ ...prev, [field]: value }));
  }, []);

  const value = useMemo(() => (
    { user, loading, login, loginWithGoogle: loginGoogle, logout, refreshUserData, setUserField }
  ), [user, loading, login, loginGoogle, logout, refreshUserData, setUserField]);

  return <SecureAuthContext.Provider value={value}>{children}</SecureAuthContext.Provider>;
};
