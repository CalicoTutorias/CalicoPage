// "use client";
import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthService } from '../services/utils/AuthService';

const SecureAuthContext = createContext();

export const useAuth = () => {
  const context = useContext(SecureAuthContext);
  if (!context) throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState({
    isLoggedIn: false,
    email: '',
    name: '',
    phone: '',
    description: '',
    isTutor: false,
    role: 'Student',
    uid: null,
  });
  const [loading, setLoading] = useState(true);

  // Cargar usuario actual desde backend
  const loadMe = async () => {
    setLoading(true);
    try {
      const res = await AuthService.me();
      if (res?.success && res.user) {
        // Handle different response structures - user might have profile nested or fields directly
        const profile = res.user.profile || {};
        const userName = profile.name || res.user.name || res.user.email?.split('@')[0] || '';
        // Check both profile.isTutor and user.isTutor (backend might return either)
        const isTutor = profile.isTutor !== undefined ? profile.isTutor : (res.user.isTutor || false);
        
        console.log('User loaded:', { user: res.user, isTutor, profile });
        
        setUser({
          isLoggedIn: true,
          email: res.user.email || '',
          name: userName,
          isTutor: !!isTutor, // Ensure boolean
          role: isTutor ? 'Tutor' : 'Student',
          uid: res.user.uid || null,
        });
      } else {
        setUser({
          isLoggedIn: false,
          email: '',
          name: '',
          isTutor: false,
          role: 'Student',
          uid: null,
        });
      }
    } catch (err) {
      console.error('Error loading user:', err);
      setUser({
        isLoggedIn: false,
        email: '',
        name: '',
        isTutor: false,
        role: 'Student',
        uid: null,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMe();
  }, []);

  const login = async ({ email, password }) => {
    const result = await AuthService.signIn(email, password);
    await loadMe();
    return result;
  };

  const logout = async () => {
    await AuthService.signOut();
    setUser({
      isLoggedIn: false,
      email: '',
      name: '',
      isTutor: false,
      role: 'Student',
      uid: null,
    });
  };

  const loginGoogle = async (token) => {
    const result = await AuthService.googleLogin(token);
    await loadMe(); 
    return result;
};

  const updateUserRole = async (isTutor) => {
    if (!user.isLoggedIn) return;
    const res = await AuthService.updateRole(isTutor);
    await loadMe();
    return res;
  };

  const refreshUserData = async () => {
    await loadMe();
  };

const value = { user, loading, login, loginGoogle, logout, updateUserRole, refreshUserData };
  return <SecureAuthContext.Provider value={value}>{children}</SecureAuthContext.Provider>;
};
