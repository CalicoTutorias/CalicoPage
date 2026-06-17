'use client';

/**
 * Soft, persistent nudge shown across the student app whenever the logged-in
 * user is missing the fields Google sign-up skips (phone / career). Links to
 * the one-screen completar-perfil flow.
 *
 * Renders nothing when: auth is loading, the user is logged out, the profile
 * is already complete, or we're already on the completar-perfil page (no point
 * nudging toward the page you're on).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/SecureAuthContext';
import { useI18n } from '../../../lib/i18n';
import routes from '../../../routes';
import { isProfileComplete } from '../../../lib/utils/profile';

export default function CompleteProfileBanner() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();

  if (loading || !user?.isLoggedIn) return null;
  if (isProfileComplete(user)) return null;
  if (pathname === routes.COMPLETE_PROFILE) return null;

  return (
    <div className="w-full bg-orange-50 border-b border-orange-200">
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-orange-800 min-w-0">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{t('common.completeProfileBanner.message')}</span>
        </div>
        <Link
          href={routes.COMPLETE_PROFILE}
          className="flex items-center gap-1 text-sm font-semibold text-orange-700 hover:text-orange-900 flex-shrink-0"
        >
          {t('common.completeProfileBanner.cta')}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
