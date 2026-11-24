'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { AlertCircle, BadgeCheck } from 'lucide-react';
import { useI18n } from '../../../lib/i18n';
import { useAuth } from '../../context/SecureAuthContext';
import { UniversityEmailService } from '../../services/core/UniversityEmailService';
import routes from '../../../routes';
import CalicoLogo from '../../../../public/CalicoLogo.png';
import { BrandMascot } from '../../components/BrandMascot/BrandMascot';
import '../login/Login.css';

/**
 * Landing of the university-email link. Verifying needs an explicit click
 * (POST), so mail scanners that prefetch the link don't confirm it. No
 * session needed: the link is often opened on the phone's mail app.
 */
export default function ConfirmUniversityPage() {
  return (
    <Suspense fallback={<div className="login-page PrimaryBackground" />}>
      <ConfirmUniversityContent />
    </Suspense>
  );
}

const RESULT_KEYS = new Set(['success', 'invalid', 'expired', 'taken', 'unsupported']);

function ConfirmUniversityContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const { user, refreshUserData } = useAuth();
  const token = searchParams.get('token') || '';
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const handleConfirm = async () => {
    if (submitting || !token) return;
    setSubmitting(true);
    const res = await UniversityEmailService.verify(token);
    setResult(RESULT_KEYS.has(res.status) ? res : { status: 'error' });
    setSubmitting(false);
    if (res.status === 'success' && user?.isLoggedIn) await refreshUserData();
  };

  const success = result?.status === 'success';
  const nextHref = user?.isLoggedIn ? routes.PROFILE : routes.LOGIN;

  return (
    <main className="login-page PrimaryBackground">
      <section className="login-wrapper">
        <div className="login-card">
          <div className="flex flex-col justify-center items-center">
            <Image src={CalicoLogo} alt="Calico" className="logoImg w-28 md:w-36" priority />
            <BrandMascot className="mt-3" alt="" />
            <h2 className="login-title mt-4">{t('university.confirm.title')}</h2>
          </div>

          {!token ? (
            <div className="mt-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-left">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-amber-800 text-xs leading-relaxed">{t('university.confirm.missingToken')}</p>
            </div>
          ) : result ? (
            <div
              role={success ? 'status' : 'alert'}
              className={`mt-4 flex items-start gap-2 rounded-lg p-3 text-left border ${
                success ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
              }`}
            >
              {success ? (
                <BadgeCheck className="w-4 h-4 text-green-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <p className={`text-xs leading-relaxed ${success ? 'text-green-800' : 'text-amber-800'}`}>
                {t(`university.confirm.result.${result.status}`, { university: result.university?.name ?? '' })}
              </p>
            </div>
          ) : (
            <p className="text-gray-600 mt-4 text-sm">{t('university.confirm.description')}</p>
          )}

          {token && !result ? (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="login-btn w-full mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? t('university.confirm.confirming') : t('university.confirm.button')}
            </button>
          ) : (
            <button type="button" onClick={() => router.push(nextHref)} className="login-btn w-full mt-6">
              {user?.isLoggedIn ? t('university.confirm.goProfile') : t('university.confirm.goLogin')}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
