'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { useI18n } from '../../../lib/i18n';
import { AuthService } from '../../services/utils/AuthService';
import routes from '../../../routes';
import CalicoLogo from '../../../../public/CalicoLogo.png';
import { BrandMascot } from '../../components/BrandMascot/BrandMascot';
import '../login/Login.css';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_S = 120;

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={<div className="login-page PrimaryBackground" />}>
      <VerifyOtpContent />
    </Suspense>
  );
}

function VerifyOtpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const email = searchParams.get('email') || '';

  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN_S);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef([]);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleChange = (index, value) => {
    // Allow only digits
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError('');

    // Auto-focus next input
    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    const newOtp = [...otp];
    for (let i = 0; i < pasted.length; i++) {
      newOtp[i] = pasted[i];
    }
    setOtp(newOtp);
    const nextIndex = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[nextIndex]?.focus();
  };

  const otpCode = otp.join('');
  const isComplete = otpCode.length === OTP_LENGTH;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isComplete) return;

    setLoading(true);
    setError('');
    try {
      const data = await AuthService.verifyOtp(email, otpCode);
      // Navigate to reset-password with the resetToken
      router.push(
        `${routes.RESET_PASSWORD}?email=${encodeURIComponent(email)}&token=${encodeURIComponent(data.resetToken)}`,
      );
    } catch (err) {
      setError(
        err.message === 'OTP_INVALID'
          ? t('auth.verifyOtp.invalidCode')
          : err.message || t('auth.verifyOtp.genericError'),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || resending) return;
    setResending(true);
    setError('');
    try {
      await AuthService.forgotPassword(email);
      setCountdown(RESEND_COOLDOWN_S);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } catch {
      setError(t('auth.verifyOtp.resendError'));
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
            <h2 className="login-title mt-4">{t('auth.verifyOtp.title')}</h2>
            <p className="text-gray-600 mt-2 text-sm">
              {t('auth.verifyOtp.description')}
            </p>
            {email && (
              <p className="text-gray-800 font-semibold mt-1 text-sm break-all">
                {email}
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="mt-6">
            <div className="flex justify-center gap-3" onPaste={handlePaste}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className={`w-12 h-14 text-center text-xl font-bold border-2 rounded-xl focus:outline-none focus:ring-2 transition-colors ${
                    error
                      ? 'border-red-400 focus:ring-red-300'
                      : isComplete
                        ? 'border-green-400 focus:ring-green-300'
                        : 'border-gray-300 focus:ring-orange-300'
                  }`}
                  autoComplete="one-time-code"
                />
              ))}
            </div>

            {error && <p className="text-red-500 text-sm text-center mt-3">{error}</p>}

            <button
              type="submit"
              className="login-btn w-full mt-6"
              disabled={!isComplete || loading}
            >
              {loading ? t('common.loading') : t('auth.verifyOtp.submitButton')}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={handleResend}
              disabled={countdown > 0 || resending}
              className="text-sm text-orange-600 underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {countdown > 0
                ? `${t('auth.verifyOtp.resendButton')} (${countdown}s)`
                : resending
                  ? t('common.loading')
                  : t('auth.verifyOtp.resendButton')}
            </button>
          </div>

          <p className="login-text">
            <button onClick={() => router.push(routes.LOGIN)} className="login-link">
              {t('auth.forgotPassword.backToLogin')}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
