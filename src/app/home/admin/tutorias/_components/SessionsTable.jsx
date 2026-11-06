'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, ExternalLink, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminService } from '@/app/services/core/AdminService';
import { useI18n } from '@/lib/i18n';
import { CARD, CHIP, ERROR_BOX, HINT, INK, INPUT, LABEL, MUTED, TABLE_WRAP, TD, TH, TONE, TR } from '../../eventos/_components/ui';

const NS = 'admin.sessions';
const PAGE_SIZE = 25;
// SessionStatusEnum (prisma/schema.prisma); the API validates the same list.
const STATUSES = ['Pending', 'Accepted', 'Rejected', 'Completed', 'Canceled'];
const FLAGS = ['upcoming', 'missingMeet', 'includeTest'];
const EMPTY_FILTERS = {
  statuses: [], from: '', to: '', search: '', upcoming: false, missingMeet: false, includeTest: false,
};

const STATUS_TONE = {
  Completed: TONE.success,
  Accepted:  TONE.info,
  Pending:   TONE.warning,
  Canceled:  TONE.danger,
  Rejected:  TONE.neutral,
};

const PAYMENT_TONE = {
  paid:    TONE.success,
  pending: TONE.warning,
  failed:  TONE.danger,
  none:    TONE.neutral,
};

const isHttps = (url) => /^https:\/\//i.test(url);

/**
 * Every session behind /home/admin/tutorias with its filters, server-side
 * pagination and CSV export of the current filters. Owns its filter and
 * page state; `refreshToken` changes when something outside (a retried
 * payment) booked a session.
 */
export default function SessionsTable({ refreshToken = 0 }) {
  const { t, formatCurrency, formatDate, formatDateTime } = useI18n();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [searchDraft, setSearchDraft] = useState('');
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  // Last settled response, tagged with the request it answers; the table is
  // loading whenever that tag doesn't match the current request.
  const [result, setResult] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const requestKey = JSON.stringify([filters, page, reload, refreshToken]);

  useEffect(() => {
    let ignore = false;
    AdminService.listSessions(filters, { limit: PAGE_SIZE, offset: page * PAGE_SIZE }).then((res) => {
      if (ignore) return;
      setResult(res.success
        ? { key: requestKey, items: res.items || [], total: res.total ?? 0, error: null }
        : { key: requestKey, items: [], total: 0, error: res.status === 429 ? `${NS}.rateLimited` : `${NS}.error` });
    });
    return () => { ignore = true; };
  }, [requestKey, filters, page]);

  const loading = result?.key !== requestKey;
  const error = loading ? null : result.error;
  const items = result?.items ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  const update = (patch) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
  };
  const toggleStatus = (status) => update({
    statuses: filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status],
  });
  const submitSearch = (e) => {
    e.preventDefault();
    update({ search: searchDraft.trim() });
  };
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearchDraft('');
    setPage(0);
  };
  const exportCsv = async () => {
    setExporting(true);
    setExportError(false);
    const res = await AdminService.downloadSessionsCsv(filters);
    setExporting(false);
    if (!res.success) setExportError(true);
  };

  const time = (d) => formatDateTime(d, { hour: 'numeric', minute: '2-digit' });
  const toggle = (pressed) => ({ size: 'sm', variant: pressed ? 'secondary' : 'outline', className: 'rounded-full', 'aria-pressed': pressed });

  const meetCell = (s) => {
    if (s.meetLink && isHttps(s.meetLink)) {
      return (
        <a
          href={s.meetLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--calico-info-text)] hover:underline"
        >
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          {t(`${NS}.meet.open`)}
        </a>
      );
    }
    if (s.meetLink) return <span className={`text-xs break-all ${MUTED}`}>{s.meetLink}</span>;
    if (s.missingMeet) return <span className={`${CHIP} ${TONE.danger}`}>{t(`${NS}.meet.missing`)}</span>;
    return <span className={MUTED}>—</span>;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className={`${CARD} p-4 flex flex-col gap-3`}>
        <form role="search" onSubmit={submitSearch} className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <label className="flex-1 flex flex-col gap-1">
            <span className={LABEL}>{t(`${NS}.filters.searchLabel`)}</span>
            <input
              type="search"
              className={INPUT}
              value={searchDraft}
              maxLength={100}
              placeholder={t(`${NS}.filters.searchPlaceholder`)}
              onChange={(e) => setSearchDraft(e.target.value)}
            />
          </label>
          <Button type="submit" variant="outline">
            <Search />
            {t(`${NS}.filters.searchSubmit`)}
          </Button>
        </form>

        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>{t(`${NS}.filters.from`)}</span>
            <input
              type="date"
              className={INPUT}
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => update({ from: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>{t(`${NS}.filters.to`)}</span>
            <input
              type="date"
              className={INPUT}
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => update({ to: e.target.value })}
            />
          </label>
        </div>

        <div role="group" aria-label={t(`${NS}.filters.status`)} className="flex flex-wrap gap-1.5">
          <Button {...toggle(filters.statuses.length === 0)} onClick={() => update({ statuses: [] })}>
            {t(`${NS}.filters.allStatuses`)}
          </Button>
          {STATUSES.map((status) => (
            <Button key={status} {...toggle(filters.statuses.includes(status))} onClick={() => toggleStatus(status)}>
              {t(`${NS}.status.${status}`)}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {FLAGS.map((flag) => (
              <Button key={flag} {...toggle(filters[flag])} onClick={() => update({ [flag]: !filters[flag] })}>
                {t(`${NS}.filters.${flag}`)}
              </Button>
            ))}
            {hasFilters && (
              <Button size="sm" variant="ghost" onClick={clearFilters}>{t(`${NS}.filters.clear`)}</Button>
            )}
          </div>
          <div className="flex flex-col items-start sm:items-end gap-1">
            <Button size="sm" variant="outline" disabled={exporting} onClick={exportCsv}>
              <Download />
              {exporting ? t(`${NS}.filters.exporting`) : t(`${NS}.filters.export`)}
            </Button>
            <span className={HINT}>{t(`${NS}.filters.exportHint`)}</span>
          </div>
        </div>
        {exportError && <p className={ERROR_BOX}>{t(`${NS}.filters.exportError`)}</p>}
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-[var(--calico-slate-50)] rounded-[var(--radius-lg)] animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className={ERROR_BOX}>{t(error)}</p>
          <Button size="sm" variant="outline" onClick={() => setReload((n) => n + 1)}>{t(`${NS}.retry`)}</Button>
        </div>
      ) : items.length === 0 ? (
        <p className={`py-8 text-center text-sm ${MUTED}`}>{t(`${NS}.empty`)}</p>
      ) : (
        <div className={TABLE_WRAP}>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={TH}>{t(`${NS}.columns.when`)}</th>
                <th className={TH}>{t(`${NS}.columns.course`)}</th>
                <th className={TH}>{t(`${NS}.columns.tutor`)}</th>
                <th className={TH}>{t(`${NS}.columns.students`)}</th>
                <th className={TH}>{t(`${NS}.columns.status`)}</th>
                <th className={TH}>{t(`${NS}.columns.source`)}</th>
                <th className={`${TH} text-right`}>{t(`${NS}.columns.payment`)}</th>
                <th className={TH}>{t(`${NS}.columns.meet`)}</th>
                <th className={TH}>{t(`${NS}.columns.created`)}</th>
                <th className={TH}>{t(`${NS}.columns.cancellation`)}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className={TR}>
                  <td className={`${TD} whitespace-nowrap`}>
                    <p className={`font-medium ${INK}`}>
                      {formatDate(s.startTimestamp, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    <p className={`text-xs ${MUTED}`}>{time(s.startTimestamp)} – {time(s.endTimestamp)}</p>
                  </td>
                  <td className={`${TD} min-w-[10rem]`}>
                    <p className={INK}>{s.course?.name || '—'}</p>
                    <div className="flex flex-wrap items-center gap-1">
                      {s.course?.code && <span className={`text-xs ${MUTED}`}>{s.course.code}</span>}
                      {s.isTest && <span className={`${CHIP} ${TONE.warning}`}>{t(`${NS}.test`)}</span>}
                    </div>
                  </td>
                  <td className={`${TD} min-w-[10rem]`}>
                    <p className={INK}>{s.tutor?.name || '—'}</p>
                    {s.tutor?.email && <p className={`text-xs break-all ${MUTED}`}>{s.tutor.email}</p>}
                  </td>
                  <td className={`${TD} min-w-[10rem]`}>
                    {s.students.length === 0 ? (
                      <span className={MUTED}>—</span>
                    ) : (
                      s.students.map((u) => (
                        <div key={u.id} className="mb-1 last:mb-0">
                          <p className={INK}>
                            {u.name}
                            {u.external && <span className={`text-xs ${MUTED}`}> · {t(`${NS}.external`)}</span>}
                          </p>
                          {u.email && <p className={`text-xs break-all ${MUTED}`}>{u.email}</p>}
                        </div>
                      ))
                    )}
                  </td>
                  <td className={TD}>
                    <span className={`${CHIP} ${STATUS_TONE[s.status] || TONE.neutral}`}>{t(`${NS}.status.${s.status}`)}</span>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-xs ${INK}`}>{t(`${NS}.source.${s.source}`)}</td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    {s.payment.amount != null && (
                      <p className={`font-semibold ${INK}`}>{formatCurrency(s.payment.amount, 'COP')}</p>
                    )}
                    <span className={`${CHIP} ${PAYMENT_TONE[s.payment.status] || TONE.neutral}`}>
                      {t(`${NS}.payment.${s.payment.status}`)}
                    </span>
                    {s.payment.status !== 'none' && (
                      <p className={`text-xs mt-1 ${MUTED}`}>
                        {t(s.payment.viaWompi ? `${NS}.payment.wompi` : `${NS}.payment.noWompi`)}
                      </p>
                    )}
                  </td>
                  <td className={TD}>{meetCell(s)}</td>
                  <td className={`${TD} whitespace-nowrap text-xs ${MUTED}`}>{formatDateTime(s.createdAt)}</td>
                  <td className={`${TD} min-w-[10rem] text-xs`}>
                    {s.cancellation ? (
                      <>
                        {s.cancellation.at && (
                          <p className={INK}>{t(`${NS}.cancellation.on`, { date: formatDateTime(s.cancellation.at) })}</p>
                        )}
                        {s.cancellation.by && <p className={MUTED}>{t(`${NS}.cancellation.by.${s.cancellation.by}`)}</p>}
                        {s.cancellation.reason && <p className={`break-words ${INK}`}>{s.cancellation.reason}</p>}
                      </>
                    ) : (
                      <span className={MUTED}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className={`text-xs ${MUTED}`}>
            {t(`${NS}.pagination.page`, { page: page + 1, total: totalPages })}
            {' · '}
            {t(total === 1 ? `${NS}.pagination.sessions_one` : `${NS}.pagination.sessions_other`, { count: total })}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label={t(`${NS}.pagination.previous`)}
            >
              <ChevronLeft />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label={t(`${NS}.pagination.next`)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
