'use client';

import { BadgeCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { universityByCode } from '@/lib/universities/universities';

/**
 * "Verified Uniandes" badge: the person proved they own an email of that
 * university (src/lib/services/university-email.service.js). Renders nothing
 * without a known university code, so it can be dropped next to any name.
 *
 * Props:
 *  - code: `verifiedUniversity` from the API (e.g. 'uniandes'), or null
 *  - compact: icon only (tight rows); the full text stays in the tooltip and
 *    for screen readers
 */
export default function UniversityBadge({ code, compact = false, className = '' }) {
  const { t } = useI18n();
  const university = universityByCode(code);
  if (!university) return null;

  const title = t('university.badge.title', { university: university.name });
  return (
    <span
      title={title}
      aria-label={title}
      role="img"
      className={`inline-flex items-center gap-1 align-middle shrink-0 rounded-full font-semibold leading-none text-[var(--calico-green-success-dark)] ${
        compact ? '' : 'bg-[var(--calico-green-success-soft)] px-2 py-1 text-xs'
      } ${className}`}
    >
      <BadgeCheck aria-hidden="true" className={compact ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
      {!compact && <span aria-hidden="true">{t('university.badge.label', { university: university.shortName })}</span>}
    </span>
  );
}
