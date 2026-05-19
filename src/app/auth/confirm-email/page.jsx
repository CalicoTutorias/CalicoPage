'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { useI18n } from '../../../lib/i18n';
import { AuthService } from '../../services/utils/AuthService';
import routes from '../../../routes';
import CalicoLogo from '../../../../public/CalicoLogo.png';
import { BrandMascot } from '../../components/BrandMascot/BrandMascot';
import { AlertCircle } from 'lucide-react';
import '../login/Login.css';

export default function ConfirmEmailPage() {
  return (
    <Suspense fallback={<div className="login-page PrimaryBackground" />}>
      <ConfirmEmailContent />
    </Suspense>
  );
}

function ConfirmEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const token = searchParams.get('token') || '';
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (submitting || !token) return;
    setSubmitting(true);
    // 'invalid' from the API maps to the 'error' state on the result page,
    // which renders the "request a new link" message.
    const { status } = await AuthService.verifyEmail(token);
    const mapped = status === 'invalid' ? 'error' : status;
    router.replace(`${routes.EMAIL_VERIFIED}?status=${encodeURIComponent(mapped)}`);
  };

  return (
    <main className="login-page PrimaryBackground">
      <section className="login-wrapper">
        <div className="login-card">
          <div className="flex flex-col justify-center items-center">
            <Image src={CalicoLogo} alt="Calico" className="logoImg w-28 md:w-36" priority />
            <BrandMascot className="mt-3" alt="" />
            <h2 className="login-title mt-4">{t('auth.confirmEmail.title')}</h2>
          </div>

          {token ? (
            <>
              <p className="text-gray-600 mt-4 text-sm">
                {t('auth.confirmEmail.description')}
              </p>

              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="login-btn w-full mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting
                  ? t('auth.confirmEmail.confirming')
                  : t('auth.confirmEmail.confirmButton')}
              </button>
            </>
          ) : (
            <>
              <div className="mt-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-left">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-amber-800 text-xs leading-relaxed">
                  {t('auth.confirmEmail.missingToken')}
                </p>
              </div>

              <button
                onClick={() => router.push(routes.LOGIN)}
                className="login-btn w-full mt-6"
              >
                {t('auth.emailVerified.goLogin')}
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
