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
  bio: '',
  isTutor: false,
  isTutorRequested: false,
  isTutorApproved: false,
  tutorApplicationStatus: null,
  role: 'Student',
  uid: null,
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
        setUser({
          isLoggedIn: true,
          email: u.email || '',
          name: u.name || '',
          phone: u.phoneNumber || '',
          bio: u.bio || '',
          profilePictureUrl: u.profilePictureUrl || null,
          isTutor: !!u.isTutorApproved,
          isTutorRequested: !!u.isTutorRequested,
          isTutorApproved: !!u.isTutorApproved,
          tutorApplicationStatus: u.tutorApplicationStatus ?? null,
          role: u.isTutorApproved ? 'Tutor' : 'Student',
          uid: u.id || null,
          major: u.major || null,
        });
      } else {
        setUser(EMPTY_USER);
      }
    } catch (err) {
      console.error('Error loading user:', err);
      setUser(EMPTY_USER);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * On mount: if a JWT exists in localStorage, validate it by calling /api/auth/me.
   * If no token or token is invalid, remain logged out.
   */
  useEffect(() => {
    const token = AuthService.getToken();
    if (token) {
      loadMe();
    } else {
      setLoading(false);
    }
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

  const loginGoogle = useCallback(async () => {
    console.warn('Google login is not yet implemented');
    return { success: false, error: 'Google login not implemented' };
  }, []);

  /**
   * Refresh user data from the server.
   */
  const refreshUserData = useCallback(async () => {
    await loadMe();
  }, [loadMe]);

  const value = useMemo(() => (
    { user, loading, login, loginGoogle, logout, refreshUserData }
  ), [user, loading, login, loginGoogle, logout, refreshUserData]);

  return <SecureAuthContext.Provider value={value}>{children}</SecureAuthContext.Provider>;
};
