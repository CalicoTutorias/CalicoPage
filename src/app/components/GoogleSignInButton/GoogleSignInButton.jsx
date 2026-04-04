/**
 * GoogleSignInButton Component
 * Renders a Google Sign-In button using Google Identity Services
 */
'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '../../context/SecureAuthContext';
import { useI18n } from '../../../lib/i18n';
import './GoogleSignInButton.css';

export default function GoogleSignInButton({ onSuccess, onError, disabled = false }) {
  const { loginWithGoogle } = useAuth();
  const { t } = useI18n();
  const buttonRef = useRef(null);
  const googleInitialized = useRef(false);

  useEffect(() => {
    // Load Google Identity Services script
    if (googleInitialized.current) return;

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      if (window.google && buttonRef.current) {
        window.google.accounts.id.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          callback: handleCredentialResponse,
        });

        window.google.accounts.id.renderButton(
          buttonRef.current,
          {
            theme: 'outline',
            size: 'large',
            width: buttonRef.current.offsetWidth,
            text: 'continue_with',
            locale: 'es',
          }
        );

        googleInitialized.current = true;
      }
    };

    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const handleCredentialResponse = async (response) => {
    try {
      const result = await loginWithGoogle(response.credential);
      
      if (result?.success) {
        onSuccess?.(result);
      } else {
        const errorMsg = result?.error || 'Google sign-in failed';
        onError?.(errorMsg);
      }
    } catch (error) {
      console.error('Google sign-in error:', error);
      onError?.(error.message || 'Google sign-in failed');
    }
  };

  return (
    <div className="google-signin-container">
      <div 
        ref={buttonRef} 
        className={`google-signin-button ${disabled ? 'disabled' : ''}`}
      />
    </div>
  );
}
