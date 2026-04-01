'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { useI18n } from '../../../lib/i18n';
import { AuthService } from '../../services/utils/AuthService';
import routes from '../../../routes';
import CalicoLogo from '../../../../public/CalicoLogo.png';
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

  const email = searchParams.get('email') || '';

  const [countdown, setCountdown] = useState(RESEND_COOLDOWN_S);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState('');

  // Countdown timer for resend button
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Poll for verification status
  const checkVerification = useCallback(async () => {
    if (!email) return;
    try {
      const data = await AuthService.checkVerification(email);
      if (data.isEmailVerified) {
        router.replace(routes.HOME);
      }
    } catch {
      // Silent — retry on next poll
    }
  }, [email, router]);

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
