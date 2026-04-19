'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { useI18n } from '../../../lib/i18n';
import { AuthService } from '../../services/utils/AuthService';
import routes from '../../../routes';
import CalicoLogo from '../../../../public/CalicoLogo.png';
import { BrandMascot } from '../../components/BrandMascot/BrandMascot';
import { Eye, EyeOff, Check, X } from 'lucide-react';
import '../login/Login.css';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="login-page PrimaryBackground" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const resetToken = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Password validation rules
  const rules = [
    { key: 'minLength', test: (p) => p.length >= 6, label: t('auth.resetPassword.ruleMinLength') },
    { key: 'uppercase', test: (p) => /[A-Z]/.test(p), label: t('auth.resetPassword.ruleUppercase') },
    { key: 'special', test: (p) => /[^A-Za-z0-9]/.test(p), label: t('auth.resetPassword.ruleSpecial') },
  ];

  const allRulesPass = rules.every((r) => r.test(password));
  const passwordsMatch = password && password === confirmPassword;
  const canSubmit = allRulesPass && passwordsMatch && !loading;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError('');
    try {
      await AuthService.resetPassword(resetToken, password);
      setSuccess(true);
      setTimeout(() => router.push(routes.LOGIN), 2500);
    } catch (err) {
      if (err.message === 'RESET_TOKEN_INVALID') {
        setError(t('auth.resetPassword.tokenExpired'));
      } else {
        setError(err.message || t('auth.resetPassword.genericError'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page PrimaryBackground">
      <section className="login-wrapper">
        <div className="login-card">
          <div className="flex flex-col justify-center items-center">
            <Image src={CalicoLogo} alt="Calico" className="logoImg w-28 md:w-36" priority />
            <BrandMascot className="mt-3" alt="" />
            <h2 className="login-title mt-4">{t('auth.resetPassword.title')}</h2>
            <p className="text-gray-600 mt-2 text-sm">
              {t('auth.resetPassword.description')}
            </p>
          </div>

          {success ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center mt-6">
              <p className="text-green-700 font-medium">
                {t('auth.resetPassword.success')}
              </p>
              <p className="text-green-600 text-sm mt-1">
                {t('auth.resetPassword.redirecting')}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="login-form mt-6">
              {/* New Password */}
              <label className="login-label">{t('auth.resetPassword.newPassword')}</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="login-input w-full pr-10"
                  placeholder={t('auth.resetPassword.newPasswordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password rules */}
              {password && (
                <div className="flex flex-col gap-1 text-xs">
                  {rules.map((rule) => (
                    <div key={rule.key} className="flex items-center gap-1.5">
                      {rule.test(password) ? (
                        <Check className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-red-400" />
                      )}
                      <span className={rule.test(password) ? 'text-green-600' : 'text-red-500'}>
                        {rule.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Confirm Password */}
              <label className="login-label">{t('auth.resetPassword.confirmPassword')}</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  className="login-input w-full pr-10"
                  placeholder={t('auth.resetPassword.confirmPasswordPlaceholder')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {confirmPassword && !passwordsMatch && (
                <p className="text-red-500 text-xs">{t('auth.resetPassword.passwordsDontMatch')}</p>
              )}

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <button
                type="submit"
                className="login-btn"
                disabled={!canSubmit}
              >
                {loading ? t('common.loading') : t('auth.resetPassword.submitButton')}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
