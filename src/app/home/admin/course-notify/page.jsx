'use client';

import { useEffect, useMemo, useState } from 'react';
import { authFetch } from '../../../services/authFetch';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'notified', label: 'Notificadas' },
  { value: 'cancelled', label: 'Canceladas' },
];

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function statusLabel(status) {
  if (status === 'pending') return 'Pending';
  if (status === 'notified') return 'Notified';
  if (status === 'cancelled') return 'Cancelled';
  return status;
}

export default function AdminCourseNotifyPage() {
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
        setError('No pudimos cargar las solicitudes.');
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
  }, [status]);

  const summary = metrics?.summary || {};
  const avgHours = summary.avgHoursToNotify == null
    ? '—'
    : `${Number(summary.avgHoursToNotify).toFixed(1)} h`;

  const cards = useMemo(() => [
    { label: 'Pendientes', value: summary.pending ?? 0 },
    { label: 'Notificadas', value: summary.notified ?? 0 },
    { label: 'Total histórico', value: summary.total ?? 0 },
    { label: 'Tiempo promedio', value: avgHours },
  ], [summary.pending, summary.notified, summary.total, avgHours]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Notify Me</h2>
          <p className="text-sm text-gray-500">
            Solicitudes de estudiantes esperando disponibilidad por materia.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Estado
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      {metrics?.topCourses?.length ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900">Materias más solicitadas</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {metrics.topCourses.map((course) => (
              <div key={course.courseId} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm">
                <span className="font-medium text-gray-800">{course.courseCode} · {course.courseName}</span>
                <span className="text-gray-500">{course.pending} pendientes / {course.total} total</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-bold text-gray-900">Solicitudes</h3>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">Cargando solicitudes...</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-600">{error}</div>
        ) : subscriptions.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No hay solicitudes para este filtro.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Estudiante</th>
                  <th className="px-4 py-3">Materia</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Solicitud</th>
                  <th className="px-4 py-3">Notificación</th>
                  <th className="px-4 py-3">Origen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subscriptions.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{item.studentName}</div>
                      <div className="text-xs text-gray-500">{item.studentEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{item.courseName}</div>
                      <div className="text-xs text-gray-500">{item.courseCode}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-700">
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(item.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(item.notifiedAt)}</td>
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
