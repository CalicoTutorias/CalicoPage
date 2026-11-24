'use client';

/**
 * Home card that invites people without the university badge to verify their
 * university email (src/app/home/profile/_components/UniversityEmailCard.jsx).
 *
 * Silent when it doesn't apply: logged out, already verified, or dismissed in
 * the last DISMISS_DAYS (per browser, localStorage — a convenience, not state
 * that must persist). The copy changes with the role: tutors earn trust from
 * students, students show it to their tutors.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/app/context/SecureAuthContext';
import { useI18n } from '@/lib/i18n';
import routes from '@/routes';

export const UNIVERSITY_NUDGE_DISMISS_DAYS = 30;
const STORAGE_KEY = 'calico_university_nudge_dismissed_at';

function dismissedRecently(now = Date.now()) {
  try {
    const at = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(at) && at > 0 && now - at < UNIVERSITY_NUDGE_DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

export default function UniversityVerifyNudge({ role = 'student', className = '' }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const [hidden, setHidden] = useState(true); // decided after mount (localStorage)

  useEffect(() => {
    setHidden(dismissedRecently());
  }, []);

  if (loading || !user?.isLoggedIn || user.verifiedUniversity || hidden) return null;

  const isTutor = role === 'tutor';
  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // Private mode / blocked storage: hide for this visit only.
    }
    setHidden(true);
  };

  return (
    <aside
      aria-labelledby="university-nudge-title"
      className={`relative rounded-2xl border border-[var(--calico-green-success-soft)] bg-white/95 shadow-sm px-4 py-4 sm:px-5 ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 pr-8 sm:pr-10">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="flex-shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-[var(--calico-green-success-soft)] text-[var(--calico-green-success-dark)]">
            <BadgeCheck className="w-5 h-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p id="university-nudge-title" className="text-sm sm:text-base font-semibold text-gray-900 leading-snug">
              {t(isTutor ? 'university.nudge.tutorTitle' : 'university.nudge.studentTitle')}
            </p>
            <p className="text-sm text-gray-600 mt-0.5 leading-relaxed">
              {t(isTutor ? 'university.nudge.tutorBody' : 'university.nudge.studentBody')}
            </p>
          </div>
        </div>
        <Button asChild variant={isTutor ? 'tutor' : 'cta'} size="sm" className="self-start sm:self-center shrink-0">
          <Link href={`${routes.PROFILE}#${routes.UNIVERSITY_EMAIL_ANCHOR}`}>
            {t('university.nudge.cta')}
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={dismiss}
        aria-label={t('university.nudge.dismiss')}
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </Button>
    </aside>
  );
}
