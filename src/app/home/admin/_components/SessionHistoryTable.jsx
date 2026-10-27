'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminService } from '../../../services/core/AdminService';
import { useI18n } from '../../../../lib/i18n';
import { CHIP, ERROR_BOX, INK, MUTED, TD, TH, TONE, TR } from '../eventos/_components/ui';

const FILTERS = ['all', 'scheduled', 'completed', 'canceled'];
const PAGE_SIZE = 25;

const STATUS_TONE = {
  Completed: TONE.success,
  Accepted:  TONE.info,
  Pending:   TONE.warning,
  Canceled:  TONE.danger,
  Rejected:  TONE.neutral,
};

const PAYMENT_TONE = {
  pending: TONE.warning,
  failed:  TONE.danger,
};

/**
 * Session-level history under the dashboard charts: every session behind
 * the counts and the net, with when it was booked, when it ran, who took it,
 * who gave it, its length, status and what was charged. Owns its own filter
 * and page; `refreshToken` changes when the dashboard's "Refrescar" is used.
 */
export default function SessionHistoryTable({ refreshToken = 0 }) {
  const { t, formatCurrency, formatDate, formatDateTime } = useI18n();
  const [filter, setFilter] = useState('all');
  const [page,   setPage]   = useState(0);
  const [reload, setReload] = useState(0);
  // Last settled response, tagged with the request it answers; the panel is
  // loading whenever that tag doesn't match the current request.
  const [result, setResult] = useState(null);
  const requestKey = `${filter}|${page}|${reload}|${refreshToken}`;

  useEffect(() => {
    let ignore = false;
    AdminService.metricsSessionHistory({ filter, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((res) => {
        if (!res.success) throw new Error(res.error);
        if (!ignore) setResult({ key: requestKey, items: res.items || [], total: res.total ?? 0, error: false });
      })
      .catch(() => {
        if (!ignore) setResult({ key: requestKey, items: [], total: 0, error: true });
      });
    return () => { ignore = true; };
  }, [requestKey, filter, page]);

  const loading = result?.key !== requestKey;
  const error   = !loading && result.error;
  const items   = result?.items ?? [];
  const total   = result?.total ?? 0;

  const changeFilter = (key) => {
    setFilter(key);
    setPage(0);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const money = (n) => formatCurrency(n, 'COP');
  const time = (d) => formatDateTime(d, { hour: 'numeric', minute: '2-digit' });

  const duration = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return t('admin.dashboard.history.duration.minutes', { m });
    if (m === 0) return t('admin.dashboard.history.duration.hours', { h });
    return t('admin.dashboard.history.duration.hoursMinutes', { h, m });
  };

  return (
    <div className="bg-white rounded-[var(--radius-xl)] border border-[var(--calico-slate-100)] p-4">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
        <div className="min-w-0">
          <h3 className={`text-sm font-semibold ${INK}`}>{t('admin.dashboard.history.title')}</h3>
          <p className={`text-xs ${MUTED}`}>{t('admin.dashboard.history.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((key) => (
            <Button
              key={key}
              size="sm"
              variant={filter === key ? 'secondary' : 'outline'}
              className="rounded-full"
              aria-pressed={filter === key}
              onClick={() => changeFilter(key)}
            >
              {t(`admin.dashboard.history.filters.${key}`)}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-[var(--calico-slate-50)] rounded-[var(--radius-lg)] animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className={ERROR_BOX}>{t('admin.dashboard.history.error')}</p>
          <Button size="sm" variant="outline" onClick={() => setReload((n) => n + 1)}>
            {t('admin.dashboard.history.retry')}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className={`py-8 text-center text-sm ${MUTED}`}>{t('admin.dashboard.history.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={TH}>{t('admin.dashboard.history.columns.session')}</th>
                <th className={TH}>{t('admin.dashboard.history.columns.duration')}</th>
                <th className={TH}>{t('admin.dashboard.history.columns.course')}</th>
                <th className={TH}>{t('admin.dashboard.history.columns.student')}</th>
                <th className={TH}>{t('admin.dashboard.history.columns.tutor')}</th>
                <th className={TH}>{t('admin.dashboard.history.columns.status')}</th>
                <th className={TH}>{t('admin.dashboard.history.columns.booked')}</th>
                <th className={`${TH} text-right`}>{t('admin.dashboard.history.columns.payment')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => {
                const isPast = new Date(s.endTimestamp) < new Date();
                return (
                  <tr key={s.id} className={TR}>
                    <td className={`${TD} whitespace-nowrap`}>
                      <p className={`font-medium ${INK}`}>
                        {formatDate(s.startTimestamp, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      <p className={`text-xs ${MUTED}`}>{time(s.startTimestamp)} – {time(s.endTimestamp)}</p>
                    </td>
                    <td className={`${TD} whitespace-nowrap ${INK}`}>{duration(s.durationMinutes)}</td>
                    <td className={`${TD} min-w-[10rem]`}>
                      <p className={INK}>{s.course?.name || '—'}</p>
                      {s.course?.code && <p className={`text-xs ${MUTED}`}>{s.course.code}</p>}
                    </td>
                    <td className={`${TD} min-w-[9rem]`}>
                      {s.students.length === 0 ? (
                        <span className={MUTED}>—</span>
                      ) : (
                        s.students.map((u) => (
                          <p key={u.id} className={INK}>
                            {u.name}
                            {u.external && (
                              <span className={`text-xs ${MUTED}`}> · {t('admin.dashboard.history.external')}</span>
                            )}
                          </p>
                        ))
                      )}
                    </td>
                    <td className={`${TD} min-w-[9rem] ${INK}`}>{s.tutor?.name || '—'}</td>
                    <td className={TD}>
                      <div className="flex flex-wrap gap-1">
                        <span className={`${CHIP} ${STATUS_TONE[s.status] || TONE.neutral}`}>
                          {t(`admin.dashboard.history.status.${s.status}`)}
                        </span>
                        {s.source === 'ManualAdmin' && (
                          <span className={`${CHIP} ${TONE.neutral}`}>{t('admin.dashboard.history.manual')}</span>
                        )}
                      </div>
                      {s.status === 'Canceled' && s.cancelledAt && (
                        <p className={`text-xs mt-1 whitespace-nowrap ${MUTED}`}>
                          {t('admin.dashboard.history.canceledOn', { date: formatDateTime(s.cancelledAt) })}
                        </p>
                      )}
                      {s.status === 'Accepted' && isPast && (
                        <p className={`text-xs mt-1 ${MUTED}`}>{t('admin.dashboard.history.notMarkedDone')}</p>
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-xs ${MUTED}`}>{formatDateTime(s.bookedAt)}</td>
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      {s.payment.status === 'paid' ? (
                        <>
                          <p className={`font-semibold ${INK}`}>{money(s.payment.charged)}</p>
                          {s.payment.discount > 0 && (
                            <p className={`text-xs ${MUTED}`}>
                              {t('admin.dashboard.history.discount', { amount: money(s.payment.discount) })}
                            </p>
                          )}
                          <p className={`text-xs ${s.payment.calicoNet < 0 ? 'text-[var(--calico-danger-strong)]' : MUTED}`}>
                            {t('admin.dashboard.history.calicoNet', { amount: money(s.payment.calicoNet) })}
                          </p>
                        </>
                      ) : s.payment.status === 'none' ? (
                        <span className={`text-xs ${MUTED}`}>{t('admin.dashboard.history.paymentStatus.none')}</span>
                      ) : (
                        <span className={`${CHIP} ${PAYMENT_TONE[s.payment.status]}`}>
                          {t(`admin.dashboard.history.paymentStatus.${s.payment.status}`)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="pt-3 mt-1 border-t border-[var(--calico-slate-100)] flex items-center justify-between flex-wrap gap-2">
          <span className={`text-xs ${MUTED}`}>
            {t('admin.dashboard.history.pagination.page', { page: page + 1, total: totalPages })}
            {' · '}
            {t(
              total === 1 ? 'admin.dashboard.history.pagination.sessions_one' : 'admin.dashboard.history.pagination.sessions_other',
              { count: total },
            )}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label={t('admin.dashboard.history.pagination.previous')}
            >
              <ChevronLeft />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label={t('admin.dashboard.history.pagination.next')}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
