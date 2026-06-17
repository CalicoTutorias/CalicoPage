'use client';

import { GraduationCap } from 'lucide-react';
import { useI18n } from '../../../../lib/i18n';

/**
 * Presentational segmentation control for the growth page.
 *
 * Career filters by the STUDENT's career for retention/cohort views.
 *
 * Props:
 *  - careers: [{ id, name }]
 *  - careerId: selected id ('' = all)
 *  - onCareerChange: (id) => void
 *  - loading: disables the controls while options load
 */
export default function DimensionFilter({
  careers = [],
  careerId = '',
  onCareerChange,
  loading = false,
}) {
  const { t } = useI18n();

  const selectClass =
    'w-full text-sm rounded-xl border border-gray-200 bg-white pl-9 pr-8 py-2 text-gray-700 ' +
    'focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 disabled:opacity-60';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 grid grid-cols-1 gap-3">
      {/* Career → retention + cohorts */}
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          {t('admin.growth.filter.careerLabel')}
        </span>
        <div className="relative mt-1">
          <GraduationCap className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            className={selectClass}
            value={careerId}
            disabled={loading}
            onChange={(e) => onCareerChange?.(e.target.value)}
          >
            <option value="">{t('admin.growth.filter.allCareers')}</option>
            {careers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </label>
    </div>
  );
}
