// app/(auth)/login/Login.jsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../context/SecureAuthContext';
import { useI18n } from '../../../lib/i18n';
import routes from '../../../routes';
import GoogleSignInButton from '../../components/GoogleSignInButton/GoogleSignInButton';
import './Login.css';
import CalicoLogo from "../../../../public/CalicoLogo.png";
import Image from "next/image";
import { Eye, EyeOff, Check } from 'lucide-react';

export default function Login() {
  const router = useRouter();
  const { user, login } = useAuth();
  const { t } = useI18n();
  const [form, setForm] = useState({ email: '', password: '' });
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (user.isLoggedIn) {
      router.replace(routes.HOME);
    }
  }, [router, user.isLoggedIn]);

  if (!mounted) return null;

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const getErrorMessage = (error) => {
    const code = error?.code || error?.error || error?.message || '';

    if (code.includes('INVALID_CREDENTIALS') || code.includes('INVALID_LOGIN_CREDENTIALS')) {
      return t('auth.login.errors.wrongPassword') || 'Correo o contraseña incorrectos';
    }
    if (code.includes('EMAIL_NOT_FOUND') || code.includes('USER_NOT_FOUND')) {
      return t('auth.login.errors.userNotFound') || 'No existe una cuenta con este correo';
    }
    if (code.includes('TOO_MANY_ATTEMPTS')) {
      return 'Demasiados intentos fallidos. Intenta de nuevo más tarde';
    }
    if (code.includes('EMAIL_NOT_VERIFIED')) {
      return 'Debes verificar tu correo electrónico antes de iniciar sesión';
    }
    if (code.includes('ACCOUNT_DISABLED')) {
      return 'Tu cuenta ha sido desactivada';
    }

    return t('auth.login.errors.generic') || 'Error al iniciar sesión. Verifica tus credenciales';
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await login({ email: form.email, password: form.password });
      if (result?.success) {
        router.push(routes.HOME);
      } else if (result?.error === 'EMAIL_NOT_VERIFIED') {
        router.push(`${routes.VERIFY_EMAIL}?email=${encodeURIComponent(result.email || form.email)}`);
      } else {
        setError(getErrorMessage(result));
      }
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col lg:flex-row PrimaryBackground">

      {/* ── BRANDING (izquierda en desktop, arriba en móvil) ── */}
      <aside className="flex flex-col items-center lg:items-start justify-center text-center lg:text-left px-6 pt-8 pb-2 lg:w-2/5 lg:py-12 lg:pl-12">
        <Image
          src={CalicoLogo}
          alt="Calico"
          className="w-44 md:w-64 lg:w-80 xl:w-96 h-auto"
          priority
        />
        <h3 className="text-2xl md:text-3xl font-bold mt-4 text-gray-800 max-w-md">
          {t('auth.brand.tagline')}
        </h3>
        <p className="hidden md:block text-gray-600 mt-3 max-w-md text-sm md:text-base">
          {t('auth.brand.pitch')}
        </p>
        <ul className="hidden md:flex flex-col gap-2 mt-5 text-sm text-gray-700">
          {['benefit1', 'benefit2', 'benefit3'].map((k) => (
            <li key={k} className="flex items-center gap-2">
              <Check className="w-4 h-4 text-orange-600 flex-shrink-0" />
              <span>{t(`auth.brand.${k}`)}</span>
            </li>
          ))}
        </ul>
      </aside>

      {/* ── FORMULARIO (derecha en desktop, abajo en móvil) ── */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 pb-8 lg:py-12 lg:pr-12">
        <div className="w-full max-w-sm">
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-800 text-center">
            {t('auth.login.title')}
          </h2>
          <p className="text-gray-600 mt-1 mb-5 text-center">
            {t('auth.login.subtitle')}
          </p>

          <form onSubmit={handleSubmit} className="login-form">
            <label htmlFor="email" className="login-label">
              {t('auth.login.email')}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="login-input"
              placeholder={t('auth.login.emailPlaceholder')}
              value={form.email}
              onChange={handleChange}
              required
            />

            <label htmlFor="password" className="login-label">
              {t('auth.login.password')}
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                className="login-input w-full pr-10"
                placeholder={t('auth.login.passwordPlaceholder')}
                value={form.password}
                onChange={handleChange}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && <p className="login-error">{error}</p>}

            <div className="flex justify-end">
              <Link href={routes.FORGOT_PASSWORD} className="text-sm text-orange-600 underline hover:opacity-80">
                {t('auth.login.forgotPassword')}
              </Link>
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? t('auth.login.loading') : t('auth.login.loginButton')}
            </button>
          </form>

          <div className="login-divider">
            <span className="login-divider-text">o</span>
          </div>

          <GoogleSignInButton
            onSuccess={() => router.push(routes.HOME)}
            onError={(errorMsg) => setError(errorMsg)}
            disabled={loading}
          />

          <p className="login-text text-center">
            {t('auth.login.noAccount')}
            <Link className="login-link" href={routes.REGISTER}>
              &nbsp;{t('auth.login.signUp')}
            </Link>
          </p>
        </div>
      </section>

    </main>
  );
}
