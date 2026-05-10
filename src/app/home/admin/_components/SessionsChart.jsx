'use client';

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { useI18n } from '../../../../lib/i18n';

/**
 * Weekly sessions chart.
 * Series: [{ weekStart, completed, canceled, upcoming }]
 */
export default function SessionsChart({ series = [], loading = false }) {
  const { t, locale } = useI18n();

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="h-6 w-40 bg-gray-100 rounded animate-pulse mb-3" />
        <div className="h-64 bg-gray-50 rounded-xl animate-pulse" />
      </div>
    );
  }

  const formatWeek = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', { day: '2-digit', month: 'short' });
  };

  const data = series.map((row) => ({
    label: formatWeek(row.weekStart),
    completed: row.completed,
    canceled: row.canceled,
    upcoming: row.upcoming,
  }));

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-1">{t('admin.charts.sessions.title')}</h3>
      <p className="text-xs text-gray-500 mb-3">{t('admin.charts.sessions.subtitle')}</p>

      {data.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-sm text-gray-400">
          {t('admin.charts.sessions.empty')}
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: '0.75rem', border: '1px solid #e5e7eb', fontSize: 12 }}
                labelStyle={{ color: '#111827', fontWeight: 600 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="completed" name={t('admin.charts.sessions.completed')} stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="canceled"  name={t('admin.charts.sessions.canceled')}  stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="upcoming"  name={t('admin.charts.sessions.upcoming')}  stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
