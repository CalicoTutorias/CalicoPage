'use client';

import { GraduationCap, Building2 } from 'lucide-react';
import { useI18n } from '../../../../lib/i18n';

/**
 * Presentational segmentation control for the growth page.
 *
 * Two independent selects because they map to different dimensions of the
 * schema: `career` filters by the STUDENT's career (retention), `department`
 * filters by the COURSE's department (profitability). Both fed from
 * /api/majors by the parent; "all" = empty value.
 *
 * Props:
 *  - careers:     [{ id, name }]
 *  - departments: [{ id, name }]
 *  - careerId / departmentId: selected ids ('' = all)
 *  - onCareerChange / onDepartmentChange: (id) => void
 *  - loading: disables the controls while options load
 */
export default function DimensionFilter({
  careers = [],
  departments = [],
  careerId = '',
  departmentId = '',
  onCareerChange,
  onDepartmentChange,
  loading = false,
}) {
  const { t } = useI18n();

  const selectClass =
    'w-full text-sm rounded-xl border border-gray-200 bg-white pl-9 pr-8 py-2 text-gray-700 ' +
    'focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 disabled:opacity-60';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      {/* Department → profitability */}
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          {t('admin.growth.filter.departmentLabel')}
        </span>
        <div className="relative mt-1">
          <Building2 className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            className={selectClass}
            value={departmentId}
            disabled={loading}
            onChange={(e) => onDepartmentChange?.(e.target.value)}
          >
            <option value="">{t('admin.growth.filter.allDepartments')}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </label>
    </div>
  );
}
