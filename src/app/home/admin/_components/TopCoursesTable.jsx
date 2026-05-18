'use client';

import { BookOpen } from 'lucide-react';
import { useI18n } from '../../../../lib/i18n';

/**
 * Ranked list of top courses by completed sessions in the last N days.
 * Items: [{ id, code, name, sessions }]
 */
export default function TopCoursesTable({ items = [], loading = false, days = 30 }) {
  const { t } = useI18n();
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">{t('admin.charts.topCourses.title')}</h3>
        <span className="text-[11px] text-gray-500">{t('admin.charts.topCourses.rangeLabel', { days })}</span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-gray-50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">
          {t('admin.charts.topCourses.empty')}
        </div>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {items.map((c, idx) => (
            <li
              key={c.id}
              className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-50 hover:bg-gray-100 transition"
            >
              <span className="w-6 text-center text-sm font-bold text-gray-400 flex-shrink-0">
                {idx + 1}
              </span>
              <BookOpen className="w-4 h-4 text-orange-500 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                {c.code && <p className="text-[11px] text-gray-500">{c.code}</p>}
              </div>
              <span className="text-sm font-semibold text-gray-700 flex-shrink-0">
                {t(
                  c.sessions === 1
                    ? 'admin.charts.topCourses.sessions_one'
                    : 'admin.charts.topCourses.sessions_other',
                  { count: c.sessions },
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
