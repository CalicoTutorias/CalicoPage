/**
 * GoogleSignInButton Component
 * Renders a Google Sign-In button using Google Identity Services
 */
'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/SecureAuthContext';
import { useI18n } from '../../../lib/i18n';
import './GoogleSignInButton.css';

export default function GoogleSignInButton({ onSuccess, onError, disabled = false }) {
  const { loginWithGoogle } = useAuth();
  const { t } = useI18n();
  const buttonRef = useRef(null);
  const googleInitialized = useRef(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const handleCredentialResponse = useCallback(async (response) => {
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
  }, [loginWithGoogle, onSuccess, onError]);

  useEffect(() => {
    // Load Google Identity Services script
    if (googleInitialized.current) return;

    if (!clientId) {
      console.error('NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured');
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      if (window.google && buttonRef.current) {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
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
        } catch (error) {
          console.error('Error initializing Google Sign-In:', error);
        }
      }
    };

    script.onerror = () => {
      console.error('Failed to load Google Identity Services script');
    };

    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [clientId, handleCredentialResponse]);

  return (
    <div className="google-signin-container">
      <div 
        ref={buttonRef} 
        className={`google-signin-button ${disabled ? 'disabled' : ''}`}
      />
    </div>
  );
}

