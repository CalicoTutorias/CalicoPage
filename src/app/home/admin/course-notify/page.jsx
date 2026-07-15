'use client';

import { useEffect, useMemo, useState } from 'react';
import { authFetch } from '../../../services/authFetch';
import { useI18n } from '../../../../lib/i18n';

const STATUS_VALUES = ['all', 'pending', 'notified', 'cancelled'];
const ROW_STATUS_VALUES = ['pending', 'notified', 'cancelled'];

export default function AdminCourseNotifyPage() {
  const { t, formatDateTime } = useI18n();
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ status, limit: '150' });
      const { ok, data } = await authFetch(`/api/admin/course-notify-subscriptions?${params.toString()}`);

      if (!alive) return;
      if (!ok || !data?.success) {
        setError(t('admin.courseNotify.error'));
        setLoading(false);
        return;
      }

      setSubscriptions(data.subscriptions || []);
      setMetrics(data.metrics || null);
      setLoading(false);
    }

    load();
    const timer = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [status, t]);

  const summary = metrics?.summary || {};
  const avgHours = summary.avgHoursToNotify == null
    ? '—'
    : t('admin.courseNotify.avgHours', { hours: Number(summary.avgHoursToNotify).toFixed(1) });

  const cards = useMemo(() => [
    { key: 'pending',  label: t('admin.courseNotify.cards.pending'),  value: summary.pending ?? 0 },
    { key: 'notified', label: t('admin.courseNotify.cards.notified'), value: summary.notified ?? 0 },
    { key: 'total',    label: t('admin.courseNotify.cards.total'),    value: summary.total ?? 0 },
    { key: 'avgTime',  label: t('admin.courseNotify.cards.avgTime'),  value: avgHours },
  ], [summary.pending, summary.notified, summary.total, avgHours, t]);

  const rowStatusLabel = (s) =>
    ROW_STATUS_VALUES.includes(s) ? t(`admin.courseNotify.rowStatus.${s}`) : s;
  const cellDate = (value) => formatDateTime(value, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">{t('admin.courseNotify.title')}</h2>
          <p className="text-xs text-gray-500">{t('admin.courseNotify.subtitle')}</p>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          {t('admin.courseNotify.statusFilterLabel')}
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
          >
            {STATUS_VALUES.map((value) => (
              <option key={value} value={value}>{t(`admin.courseNotify.status.${value}`)}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div key={card.key} className="rounded-2xl border border-gray-100 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-gray-800">{card.value}</p>
          </div>
        ))}
      </div>

      {metrics?.topCourses?.length ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-800">{t('admin.courseNotify.topCourses.title')}</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {metrics.topCourses.map((course) => (
              <div key={course.courseId} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm">
                <span className="font-medium text-gray-800">{course.courseCode} · {course.courseName}</span>
                <span className="text-gray-500">
                  {t('admin.courseNotify.topCourses.countLabel', { pending: course.pending, total: course.total })}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-800">{t('admin.courseNotify.table.title')}</h3>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">{t('admin.courseNotify.loading')}</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-rose-600">{error}</div>
        ) : subscriptions.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">{t('admin.courseNotify.empty')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">{t('admin.courseNotify.table.student')}</th>
                  <th className="px-4 py-3">{t('admin.courseNotify.table.course')}</th>
                  <th className="px-4 py-3">{t('admin.courseNotify.table.status')}</th>
                  <th className="px-4 py-3">{t('admin.courseNotify.table.requested')}</th>
                  <th className="px-4 py-3">{t('admin.courseNotify.table.notified')}</th>
                  <th className="px-4 py-3">{t('admin.courseNotify.table.source')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subscriptions.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{item.studentName}</div>
                      <div className="text-xs text-gray-500">{item.studentEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{item.courseName}</div>
                      <div className="text-xs text-gray-500">{item.courseCode}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-700">
                        {rowStatusLabel(item.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{cellDate(item.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-600">{cellDate(item.notifiedAt)}</td>
                    <td className="px-4 py-3 text-gray-600">{item.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
