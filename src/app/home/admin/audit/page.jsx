'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileClock, Filter } from 'lucide-react';
import { AdminService } from '../../../services/core/AdminService';
import { useI18n } from '../../../../lib/i18n';

const ACTION_OPTIONS = [
  { value: '',                 i18nKey: 'admin.audit.filters.actionAll' },
  { value: 'TUTOR_APPROVE',    i18nKey: 'admin.audit.filters.actionTutorApprove' },
  { value: 'TUTOR_REJECT',     i18nKey: 'admin.audit.filters.actionTutorReject' },
  { value: 'TUTOR_SUSPEND',    i18nKey: 'admin.audit.filters.actionTutorSuspend' },
  { value: 'TUTOR_REINSTATE',  i18nKey: 'admin.audit.filters.actionTutorReinstate' },
  { value: 'COURSE_APPROVE',   i18nKey: 'admin.audit.filters.actionCourseApprove' },
  { value: 'COURSE_REJECT',    i18nKey: 'admin.audit.filters.actionCourseReject' },
];

const ACTION_TONE = {
  TUTOR_APPROVE:    'bg-emerald-100 text-emerald-700',
  TUTOR_REJECT:     'bg-rose-100    text-rose-700',
  TUTOR_SUSPEND:    'bg-rose-100    text-rose-700',
  TUTOR_REINSTATE:  'bg-emerald-100 text-emerald-700',
  COURSE_APPROVE:   'bg-emerald-50  text-emerald-700',
  COURSE_REJECT:    'bg-rose-50     text-rose-700',
};

const PAGE_SIZE = 25;

function useFormatDateTime() {
  const { locale } = useI18n();
  return (value) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString(locale === 'en' ? 'en-US' : 'es-ES', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return '—';
    }
  };
}

function PayloadPreview({ payload }) {
  if (!payload) return <span className="text-gray-400">—</span>;
  // Render a compact, single-line summary; full JSON shown on hover via title.
  const summary = useMemo(() => {
    if (typeof payload === 'string') return payload;
    const entries = Object.entries(payload);
    if (entries.length === 0) return '{}';
    return entries
      .map(([k, v]) => {
        if (Array.isArray(v))      return `${k}: [${v.length}]`;
        if (typeof v === 'object') return `${k}: {…}`;
        const str = String(v);
        return `${k}: ${str.length > 30 ? `${str.slice(0, 27)}…` : str}`;
      })
      .join(' · ');
  }, [payload]);

  return (
    <span
      className="text-[11px] text-gray-600 font-mono break-all"
      title={JSON.stringify(payload, null, 2)}
    >
      {summary}
    </span>
  );
}

export default function AdminAuditPage() {
  const { t } = useI18n();
  const formatDate = useFormatDateTime();
  const [action,  setAction]  = useState('');
  const [from,    setFrom]    = useState('');
  const [to,      setTo]      = useState('');
  const [page,    setPage]    = useState(0);
  const [items,   setItems]   = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await AdminService.listAuditLog({
        action: action || undefined,
        from:   from   || undefined,
        to:     to     || undefined,
        limit:  PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      if (!res.success) throw new Error(res.error || t('admin.audit.loadError'));
      setItems(res.items || []);
      setTotal(res.total ?? 0);
    } catch (e) {
      setError(e.message);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [action, from, to, page, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Reset page when filters change.
  useEffect(() => { setPage(0); }, [action, from, to]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">

      <div className="flex items-center gap-2">
        <FileClock className="w-5 h-5 text-gray-500" />
        <h2 className="text-lg font-bold text-gray-800">{t('admin.audit.title')}</h2>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {t('admin.audit.filters.title')}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">{t('admin.audit.filters.action')}</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              {ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{t(o.i18nKey)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">{t('admin.audit.filters.from')}</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">{t('admin.audit.filters.to')}</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="m-4 bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm text-rose-700">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500">
            {t('admin.audit.empty')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  <th className="text-left px-4 py-2 whitespace-nowrap">{t('admin.audit.table.date')}</th>
                  <th className="text-left px-4 py-2">{t('admin.audit.table.admin')}</th>
                  <th className="text-left px-4 py-2">{t('admin.audit.table.action')}</th>
                  <th className="text-left px-4 py-2">{t('admin.audit.table.target')}</th>
                  <th className="text-left px-4 py-2">{t('admin.audit.table.payload')}</th>
                  <th className="text-left px-4 py-2">{t('admin.audit.table.ip')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => (
                  <tr key={entry.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 align-top whitespace-nowrap text-xs text-gray-700">
                      {formatDate(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-xs font-medium text-gray-800 truncate max-w-[160px]">
                        {entry.admin?.name || '—'}
                      </p>
                      <p className="text-[11px] text-gray-500 truncate max-w-[160px]">
                        {entry.admin?.email}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                        ACTION_TONE[entry.action] || 'bg-gray-100 text-gray-700'
                      }`}>
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-gray-700">
                      {entry.targetType && (
                        <p className="font-medium">{entry.targetType}</p>
                      )}
                      {entry.targetId && (
                        <p className="text-[11px] text-gray-500 font-mono break-all">
                          {entry.targetId.length > 24
                            ? `${entry.targetId.slice(0, 8)}…${entry.targetId.slice(-8)}`
                            : entry.targetId}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top max-w-[280px]">
                      <PayloadPreview payload={entry.payload} />
                    </td>
                    <td className="px-4 py-3 align-top text-[11px] text-gray-500 font-mono whitespace-nowrap">
                      {entry.ipAddress || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer */}
        {!loading && !error && items.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs text-gray-500">
              {t('admin.audit.pagination.page', { page: page + 1, total: totalPages })}
              {' · '}
              {t(
                total === 1 ? 'admin.audit.pagination.entries_one' : 'admin.audit.pagination.entries_other',
                { count: total },
              )}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
