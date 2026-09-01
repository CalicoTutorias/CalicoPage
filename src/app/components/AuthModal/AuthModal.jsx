"use client";

/**
 * AuthModal — inline sign-in gate for the booking flow.
 *
 * Shown when an anonymous visitor picks an available slot: instead of a
 * full-page redirect to /auth/login (which loses all visual context), they
 * authenticate right here and continue to the booking they already chose.
 *
 * Completion contract: the modal never navigates on success itself. Both
 * email login and Google sign-in funnel through the auth context
 * (loadMe → user.isLoggedIn), so a single effect watches that flag and calls
 * onAuthenticated exactly once — no callback-vs-state races.
 *
 * Registration is intentionally NOT inlined (career + phone + terms make it
 * too heavy for a modal): the "create account" link goes to the full page,
 * and the pending-booking handoff (saved by the caller before opening this
 * modal) brings the user back to their slot after the register → verify-email
 * chain completes.
 */

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, Eye, EyeOff, CalendarClock } from 'lucide-react';
import { useAuth } from '../../context/SecureAuthContext';
import { useI18n } from '../../../lib/i18n';
import routes from '../../../routes';
import { withReturnTo } from '../../../lib/utils/returnTo';
import GoogleSignInButton from '../GoogleSignInButton/GoogleSignInButton';
import { Button } from '../../../components/ui/button';
import './AuthModal.css';

export default function AuthModal({ isOpen, bookingUrl, onClose, onAuthenticated }) {
  const router = useRouter();
  const { user, loading: authLoading, login } = useAuth();
  const { t } = useI18n();

  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const notifiedRef = useRef(false);

  // Single completion authority (covers email AND Google sign-in).
  useEffect(() => {
    if (isOpen && !authLoading && user.isLoggedIn && !notifiedRef.current) {
      notifiedRef.current = true;
      onAuthenticated?.();
    }
  }, [isOpen, authLoading, user.isLoggedIn, onAuthenticated]);

  // No open/close reset effect: the parent remounts this component per open
  // (via a `key` tied to the booking URL), so all transient state starts
  // fresh each time the modal appears.

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const errorMessage = (err) => {
    const code = err?.code || err?.error || err?.message || '';
    if (code.includes('INVALID_CREDENTIALS') || code.includes('INVALID_LOGIN_CREDENTIALS')) {
      return t('auth.login.errors.wrongPassword');
    }
    if (code.includes('EMAIL_NOT_FOUND') || code.includes('USER_NOT_FOUND')) {
      return t('auth.login.errors.userNotFound');
    }
    return t('auth.login.errors.generic');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await login({ email: form.email, password: form.password });
      if (result?.success) {
        // Navigation happens in the completion effect above.
        return;
      }
      if (result?.error === 'EMAIL_NOT_VERIFIED') {
        // The pending booking was already saved by the caller — the
        // verification chain will resume it after the email is confirmed.
        router.push(
          `${routes.VERIFY_EMAIL}?email=${encodeURIComponent(result.email || form.email)}`,
        );
        return;
      }
      setError(errorMessage(result));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="auth-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        <button
          type="button"
          className="auth-modal-close"
          onClick={onClose}
          aria-label={t('auth.authModal.close')}
        >
          <X size={18} />
        </button>

        <span className="auth-modal-icon" aria-hidden="true">
          <CalendarClock size={22} />
        </span>
        <h2 id="auth-modal-title" className="auth-modal-title">
          {t('auth.authModal.title')}
        </h2>
        <p className="auth-modal-subtitle">{t('auth.authModal.subtitle')}</p>

        <form onSubmit={handleSubmit} className="auth-modal-form" noValidate={false}>
          <label htmlFor="auth-modal-email" className="auth-modal-label">
            {t('auth.login.email')}
          </label>
          <input
            id="auth-modal-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            className="auth-modal-input"
            placeholder={t('auth.login.emailPlaceholder')}
            value={form.email}
            onChange={handleChange}
            disabled={submitting}
          />

          <label htmlFor="auth-modal-password" className="auth-modal-label">
            {t('auth.login.password')}
          </label>
          <div className="auth-modal-password">
            <input
              id="auth-modal-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              className="auth-modal-input"
              placeholder={t('auth.login.passwordPlaceholder')}
              value={form.password}
              onChange={handleChange}
              disabled={submitting}
            />
            <button
              type="button"
              className="auth-modal-eye"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={
                showPassword
                  ? t('auth.authModal.hidePassword')
                  : t('auth.authModal.showPassword')
              }
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && (
            <p className="auth-modal-error" role="alert">
              {error}
            </p>
          )}

          <div className="auth-modal-forgot">
            <Link href={routes.FORGOT_PASSWORD} className="auth-modal-link">
              {t('auth.login.forgotPassword')}
            </Link>
          </div>

          <Button type="submit" variant="cta" size="lg" className="w-full" disabled={submitting}>
            {submitting ? t('auth.login.loading') : t('auth.login.loginButton')}
          </Button>
        </form>

        <div className="auth-modal-divider">
          <span>{t('auth.authModal.divider')}</span>
        </div>

        <GoogleSignInButton onError={(msg) => setError(msg)} disabled={submitting} />

        <p className="auth-modal-register">
          {t('auth.login.noAccount')}{' '}
          <Link href={withReturnTo(routes.REGISTER, bookingUrl)} className="auth-modal-link">
            {t('auth.login.signUp')}
          </Link>
        </p>
      </div>
    </div>
  );
}
