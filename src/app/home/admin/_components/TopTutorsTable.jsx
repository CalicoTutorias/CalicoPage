'use client';

import Link from 'next/link';
import { Star, ExternalLink } from 'lucide-react';
import routes from '../../../../routes';
import { useI18n } from '../../../../lib/i18n';

/**
 * Ranked list of top tutors by completed sessions in the last N days.
 * Items: [{ id, name, email, rating, numReviews, sessions }]
 */
export default function TopTutorsTable({ items = [], loading = false, days = 30 }) {
  const { t } = useI18n();
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">{t('admin.charts.topTutors.title')}</h3>
        <span className="text-[11px] text-gray-500">{t('admin.charts.topTutors.rangeLabel', { days })}</span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-gray-50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">
          {t('admin.charts.topTutors.empty')}
        </div>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {items.map((tutor, idx) => (
            <li key={tutor.id} className="px-3 py-2 rounded-xl bg-gray-50">
              <div className="flex items-center gap-3">
                <span className="w-6 text-center text-sm font-bold text-gray-400 flex-shrink-0">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{tutor.name}</p>
                  <p className="text-[11px] text-gray-500 truncate">{tutor.email}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-gray-700">
                    {t(
                      tutor.sessions === 1
                        ? 'admin.charts.topTutors.sessions_one'
                        : 'admin.charts.topTutors.sessions_other',
                      { count: tutor.sessions },
                    )}
                  </p>
                  {tutor.rating != null && tutor.rating > 0 && (
                    <p className="text-[11px] text-gray-500 inline-flex items-center gap-0.5 justify-end">
                      <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                      {tutor.rating.toFixed(2)} ({tutor.numReviews})
                    </p>
                  )}
                </div>
                <Link
                  href={routes.ADMIN_TUTOR_DETAIL(tutor.id)}
                  className="text-gray-400 hover:text-orange-600 flex-shrink-0"
                  title={t('admin.charts.topTutors.viewDetail')}
                >
                  <ExternalLink className="w-4 h-4" />
                </Link>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
