'use client';

import { useI18n } from '../../../../lib/i18n';
import MetricInfo from './MetricInfo';

/**
 * First-session cohort table. Each row is the month a group of students
 * first booked; the 30/60/90-day columns show what share returned within
 * that window, with a subtle orange heat-fill proportional to the rate.
 *
 * Props:
 *  - cohorts: [{ cohortMonth, newStudents, d30, d60, d90, rate30, rate60, rate90 }]
 *  - loading
 */
export default function CohortTable({ cohorts = [], loading = false }) {
  const { t, locale } = useI18n();

  const fmtMonth = (value) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', {
        month: 'short',
        year: '2-digit',
      });
    } catch {
      return '—';
    }
  };

  // Heat cell: orange fill scaled by rate, dark text for legibility.
  const HeatCell = ({ rate, count }) => (
    <td className="px-3 py-2 text-center">
      <div
        className="inline-flex flex-col items-center justify-center rounded-lg px-2 py-1 min-w-[3.25rem]"
        style={{ backgroundColor: `rgba(251, 146, 60, ${Math.min(rate, 1) * 0.85})` }}
      >
        <span className="text-sm font-semibold text-gray-800">{Math.round(rate * 100)}%</span>
        <span className="text-[10px] text-gray-500">{count}</span>
      </div>
    </td>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
          {t('admin.growth.cohorts.title')}
          <MetricInfo baseKey="admin.growth.info.cohorts" />
        </h3>
        <p className="text-xs text-gray-500">{t('admin.growth.cohorts.subtitle')}</p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 bg-gray-50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : cohorts.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">{t('admin.growth.cohorts.empty')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500">
                <th className="px-3 py-2 text-left font-semibold">{t('admin.growth.cohorts.cohortMonth')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('admin.growth.cohorts.newStudents')}</th>
                <th className="px-3 py-2 text-center font-semibold">{t('admin.growth.cohorts.d30')}</th>
                <th className="px-3 py-2 text-center font-semibold">{t('admin.growth.cohorts.d60')}</th>
                <th className="px-3 py-2 text-center font-semibold">{t('admin.growth.cohorts.d90')}</th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.cohortMonth} className="border-t border-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-800 capitalize whitespace-nowrap">
                    {fmtMonth(c.cohortMonth)}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">{c.newStudents}</td>
                  <HeatCell rate={c.rate30} count={c.d30} />
                  <HeatCell rate={c.rate60} count={c.d60} />
                  <HeatCell rate={c.rate90} count={c.d90} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
