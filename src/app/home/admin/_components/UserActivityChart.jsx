'use client';

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { useI18n } from '../../../../lib/i18n';

/**
 * Monthly completed-session activity for one user, split by role:
 * sessions taught (as tutor) vs sessions taken (as student).
 *
 * Series shape: [{ month: ISOString, asTutor, asStudent }]
 */
export default function UserActivityChart({ series = [], loading = false }) {
  const { t, locale } = useI18n();

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="h-6 w-40 bg-gray-100 rounded animate-pulse mb-3" />
        <div className="h-56 bg-gray-50 rounded-xl animate-pulse" />
      </div>
    );
  }

  const formatMonth = (iso) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', {
        month: 'short', year: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const data = series.map((row) => ({
    label:     formatMonth(row.month),
    asTutor:   Number(row.asTutor || 0),
    asStudent: Number(row.asStudent || 0),
  }));

  const hasAny = data.some((d) => d.asTutor > 0 || d.asStudent > 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-1">{t('admin.users.detail.activity.title')}</h3>
      <p className="text-xs text-gray-500 mb-3">{t('admin.users.detail.activity.subtitle')}</p>

      {!hasAny ? (
        <div className="h-56 flex items-center justify-center text-sm text-gray-400">
          {t('admin.users.detail.activity.empty')}
        </div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: '0.75rem', border: '1px solid #e5e7eb', fontSize: 12 }}
                labelStyle={{ color: '#111827', fontWeight: 600 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="asTutor"   name={t('admin.users.detail.activity.asTutor')}   fill="#fb923c" radius={[6, 6, 0, 0]} />
              <Bar dataKey="asStudent" name={t('admin.users.detail.activity.asStudent')} fill="#60a5fa" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
