'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useI18n } from '../../../lib/i18n';
import routes from '../../../routes';
import CalicoLogo from '../../../../public/CalicoLogo.png';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import '../login/Login.css';
import { useAuth } from '../../context/SecureAuthContext';
import { AuthService } from '../../services/utils/AuthService';

export default function EmailVerifiedPage() {
  return (
    <Suspense fallback={<div className="login-page PrimaryBackground" />}>
      <EmailVerifiedContent />
    </Suspense>
  );
}

function EmailVerifiedContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useI18n();
  const { refreshUserData } = useAuth();

  const status = searchParams.get('status'); // success | already | error

  const config = {
    success: {
      icon: <CheckCircle2 className="w-16 h-16 text-green-500" />,
      title: t('auth.emailVerified.successTitle'),
      message: t('auth.emailVerified.successMessage'),
    },
    already: {
      icon: <AlertCircle className="w-16 h-16 text-yellow-500" />,
      title: t('auth.emailVerified.alreadyTitle'),
      message: t('auth.emailVerified.alreadyMessage'),
    },
    error: {
      icon: <XCircle className="w-16 h-16 text-red-500" />,
      title: t('auth.emailVerified.errorTitle'),
      message: t('auth.emailVerified.errorMessage'),
    },
  };

  const current = config[status] || config.error;

  return (
    <main className="login-page PrimaryBackground">
      <section className="login-wrapper">
        <div className="login-card">
          <div className="flex flex-col justify-center items-center">
            <Image src={CalicoLogo} alt="Calico" className="logoImg w-28 md:w-36" priority />
            <div className="mt-6">{current.icon}</div>
            <h2 className="login-title mt-4">{current.title}</h2>
          </div>

          <p className="text-gray-600 mt-4 text-sm">{current.message}</p>

          <button
            onClick={async () => {
              if (status === 'success') {
                const hasToken = !!AuthService.getToken();
                if (hasToken) {
                  await refreshUserData();
                  router.push(routes.HOME);
                } else {
                  router.push(routes.LOGIN);
                }
              } else {
                router.push(routes.LOGIN);
              }
            }}
            className="login-btn w-full mt-6"
          >
            {status === 'success'
              ? t('auth.emailVerified.goHome')
              : t('auth.emailVerified.goLogin')}
          </button>
        </div>
      </section>
    </main>
  );
}
