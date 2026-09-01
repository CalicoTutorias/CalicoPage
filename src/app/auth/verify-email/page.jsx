'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { useI18n } from '../../../lib/i18n';
import { useAuth } from '../../context/SecureAuthContext';
import { AuthService } from '../../services/utils/AuthService';
import { consumePendingBooking } from '../../services/utils/pendingBooking';
import routes from '../../../routes';
import CalicoLogo from '../../../../public/CalicoLogo.png';
import { BrandMascot } from '../../components/BrandMascot/BrandMascot';
import { AlertCircle } from 'lucide-react';
import '../login/Login.css';

const POLL_INTERVAL_MS = 3000;
const RESEND_COOLDOWN_S = 120;

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="login-page PrimaryBackground" />}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const { refreshUserData } = useAuth();

  const email = searchParams.get('email') || '';

  const [countdown, setCountdown] = useState(RESEND_COOLDOWN_S);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState('');
  // The poll fires every 3 s; without this guard two in-flight checks could
  // both detect "verified" and race each other's redirect (the second one
  // would consume an already-consumed pending booking and land on HOME).
  const redirecting = useRef(false);

  // Countdown timer for resend button
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Poll for verification status
  const checkVerification = useCallback(async () => {
    if (!email || redirecting.current) return;
    try {
      const data = await AuthService.checkVerification(email);
      if (data.isEmailVerified && !redirecting.current) {
        redirecting.current = true;
        // If the link was confirmed in another tab of THIS browser, the
        // auto-login cookie is already set — pick the session up here and
        // resume the pending booking (if any). Confirmed on another device?
        // No cookie here: go to login, which consumes the pending booking
        // itself after a fresh sign-in.
        const sessionOk = await refreshUserData();
        if (sessionOk) {
          router.replace(consumePendingBooking() || routes.HOME);
        } else {
          router.replace(routes.LOGIN);
        }
      }
    } catch {
      // Silent — retry on next poll
    }
  }, [email, router, refreshUserData]);

  useEffect(() => {
    if (!email) return;
    const interval = setInterval(checkVerification, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkVerification, email]);

  const handleResend = async () => {
    if (countdown > 0 || resending) return;
    setResending(true);
    setMessage('');
    try {
      await AuthService.resendVerificationEmail(email);
      setMessage(t('auth.verifyEmail.resendSuccess'));
      setCountdown(RESEND_COOLDOWN_S);
    } catch {
      setMessage(t('auth.verifyEmail.resendError'));
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="login-page PrimaryBackground">
      <section className="login-wrapper">
        <div className="login-card">
          <div className="flex flex-col justify-center items-center">
            <Image src={CalicoLogo} alt="Calico" className="logoImg w-28 md:w-36" priority />
            <BrandMascot className="mt-3" alt="" />
            <h2 className="login-title mt-4">{t('auth.verifyEmail.title')}</h2>
          </div>

          <p className="text-gray-600 mt-4 text-sm">
            {t('auth.verifyEmail.description')}
          </p>

          {email && (
            <p className="text-gray-800 font-semibold mt-2 text-sm break-all">
              {email}
            </p>
          )}

          <p className="text-gray-500 mt-4 text-xs">
            {t('auth.verifyEmail.instructions')}
          </p>

          {/* Aviso de spam: muchos usuarios no encuentran el correo porque
              cae en la carpeta de no deseados o escriben mal el email. */}
          <div className="mt-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-left">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-amber-800 text-xs leading-relaxed">
              {t('auth.verifyEmail.spamWarning')}
            </p>
          </div>

          {message && (
            <p className="mt-3 text-sm text-green-600">{message}</p>
          )}

          <button
            onClick={handleResend}
            disabled={countdown > 0 || resending}
            className="login-btn w-full mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {countdown > 0
              ? `${t('auth.verifyEmail.resendButton')} (${countdown}s)`
              : resending
                ? t('common.loading')
                : t('auth.verifyEmail.resendButton')}
          </button>

          <p className="login-text">
            <button
              onClick={() => router.push(routes.LOGIN)}
              className="login-link"
            >
              {t('auth.verifyEmail.backToLogin')}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
