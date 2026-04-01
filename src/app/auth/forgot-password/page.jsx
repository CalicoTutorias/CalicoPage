'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useI18n } from '../../../lib/i18n';
import { AuthService } from '../../services/utils/AuthService';
import routes from '../../../routes';
import CalicoLogo from '../../../../public/CalicoLogo.png';
import '../login/Login.css';

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="login-page PrimaryBackground" />}>
      <ForgotPasswordContent />
    </Suspense>
  );
}

function ForgotPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const sent = searchParams.get('sent') === 'true';
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError(t('auth.forgotPassword.emailRequired'));
      return;
    }

    setLoading(true);
    try {
      const result = await AuthService.forgotPassword(email);
      if (result?.error === 'EMAIL_NOT_VERIFIED') {
        router.push(`${routes.VERIFY_EMAIL}?email=${encodeURIComponent(email)}`);
        return;
      }
      // Show confirmation — don't reveal if account exists
      router.push(`${routes.FORGOT_PASSWORD}?sent=true`);
    } catch (err) {
      setError(err.message || t('auth.forgotPassword.genericError'));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <main className="login-page PrimaryBackground">
        <section className="login-wrapper">
          <div className="login-card">
            <div className="flex flex-col justify-center items-center">
              <Image src={CalicoLogo} alt="Calico" className="logoImg w-28 md:w-36" priority />
              <h2 className="login-title mt-4">Revisa tu correo</h2>
            </div>
            <p className="text-gray-600 mt-4 text-sm text-center">
              Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña. El enlace expira en 30 minutos.
            </p>
            <p className="login-text mt-6">
              <Link href={routes.LOGIN} className="login-link">Volver al inicio de sesión</Link>
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="login-page PrimaryBackground">
      <section className="login-wrapper">
        <div className="login-card">
          <div className="flex flex-col justify-center items-center">
            <Image src={CalicoLogo} alt="Calico" className="logoImg w-28 md:w-36" priority />
            <h2 className="login-title mt-4">{t('auth.forgotPassword.title')}</h2>
            <p className="text-gray-600 mt-2 text-sm">
              {t('auth.forgotPassword.description')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="login-form mt-6">
            <label htmlFor="email" className="login-label">
              {t('auth.login.email')}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="login-input"
              placeholder={t('auth.login.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              type="submit"
              className="login-btn"
              disabled={loading || !email}
            >
              {loading ? t('common.loading') : t('auth.forgotPassword.submitButton')}
            </button>
          </form>

          <p className="login-text">
            <Link href={routes.LOGIN} className="login-link">
              {t('auth.forgotPassword.backToLogin')}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
