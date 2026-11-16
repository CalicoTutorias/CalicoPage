'use client';

import { useEffect, useState } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminService } from '@/app/services/core/AdminService';
import { useI18n } from '@/lib/i18n';
import { CHIP, ERROR_BOX, INK, MUTED, TD, TH, TONE, TR } from '../../eventos/_components/ui';

const NS = 'admin.sessions.unbooked';

const OUTCOME_TONE = {
  FULFILLED:         TONE.success,
  ALREADY_PROCESSED: TONE.info,
  NOT_APPROVED:      TONE.warning,
  NO_TRANSACTION:    TONE.warning,
  NEEDS_ATTENTION:   TONE.danger,
  ERROR:             TONE.danger,
};

// Error code of POST /api/admin/payments/reconcile → what it means for the
// operator (`${NS}.result.*`). Unknown codes fall back to `generic`.
const RESULT_KEY = {
  SESSION_CONFLICT:       'refund',
  OUTSIDE_AVAILABILITY:   'refund',
  MAX_SESSIONS_REACHED:   'refund',
  COUPON_LIMIT_EXCEEDED:  'refund',
  AMOUNT_MISMATCH:        'amountMismatch',
  PROVIDER_UNAVAILABLE:   'providerUnavailable',
  TRANSACTION_NOT_FOUND:  'noTransaction',
  NO_PENDING_TRANSACTION: 'noTransaction',
  INTENT_NOT_FOUND:       'noTransaction',
  RATE_LIMITED:           'rateLimited',
};

const HELP_KEYS = [
  'FULFILLED', 'ALREADY_PROCESSED', 'NOT_APPROVED', 'NEEDS_ATTENTION',
  'refund', 'amountMismatch', 'providerUnavailable', 'noTransaction',
];

/** Reconcile response → { code, labelKey, tone } for the row. */
function retryResult(res) {
  const outcome = res.success ? res.result?.outcome : null;
  if (outcome && OUTCOME_TONE[outcome]) {
    return { code: outcome, labelKey: `${NS}.outcome.${outcome}`, tone: OUTCOME_TONE[outcome] };
  }
  const code = typeof res.error === 'string' && /^[A-Z_]+$/.test(res.error) ? res.error : null;
  return { code, labelKey: `${NS}.result.${RESULT_KEY[code] ?? 'generic'}`, tone: TONE.danger };
}

/**
 * "Pagos sin tutoría": payment intents where Wompi charged (or may have
 * charged) and nothing was booked, each with a "Reintentar" that replays
 * the transaction through the admin reconcile route. Renders nothing while
 * loading or when the list is empty; a failed load shows an error with a
 * retry, since hiding it would hide money taken without a booking.
 * `onBooked` is called when a retry books something.
 */
export default function UnbookedPaymentsPanel({ onBooked }) {
  const { t, formatCurrency, formatDateTime } = useI18n();
  const [reload, setReload] = useState(0);
  const [state, setState] = useState(null); // { reload, items } | { reload, error: true }
  const [results, setResults] = useState({}); // reference → { busy } | { code, labelKey, tone }

  useEffect(() => {
    let ignore = false;
    AdminService.listUnbookedPayments().then((res) => {
      if (ignore) return;
      setState(res.success ? { reload, items: res.items || [] } : { reload, error: true });
    });
    return () => { ignore = true; };
  }, [reload]);

  if (!state || state.reload !== reload) return null;

  if (state.error) {
    return (
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className={ERROR_BOX}>{t(`${NS}.error`)}</p>
        <Button size="sm" variant="outline" onClick={() => setReload((n) => n + 1)}>
          {t('admin.sessions.retry')}
        </Button>
      </div>
    );
  }

  if (state.items.length === 0) return null;

  const retry = async (item) => {
    setResults((r) => ({ ...r, [item.reference]: { busy: true } }));
    const res = await AdminService.reconcilePayment({ transactionId: item.transactionId, reference: item.reference });
    const result = retryResult(res);
    setResults((r) => ({ ...r, [item.reference]: result }));
    if (result.code === 'FULFILLED') onBooked?.();
  };

  const booking = (p) => {
    if (p.kind === 'event') return <p className={INK}>{p.event?.title || '—'}</p>;
    return (
      <>
        <p className={INK}>{p.tutor?.name || '—'}</p>
        {p.course && <p className={`text-xs ${MUTED}`}>{p.course.name} · {p.course.code}</p>}
      </>
    );
  };

  const sweepCell = (p) => {
    if (!p.sweep) {
      return (
        <>
          <span className={`${CHIP} ${TONE.neutral}`}>{t(`${NS}.notSwept`)}</span>
          <p className={`text-xs mt-1 ${MUTED}`}>{t(`${NS}.pendingReported`)}</p>
        </>
      );
    }
    const known = Boolean(OUTCOME_TONE[p.sweep.outcome]);
    return (
      <>
        <span className={`${CHIP} ${known ? OUTCOME_TONE[p.sweep.outcome] : TONE.neutral}`}>
          {known ? t(`${NS}.outcome.${p.sweep.outcome}`) : p.sweep.outcome || '—'}
        </span>
        {/* status is null when the sweeper could not ask Wompi at all */}
        <p className={`text-xs mt-1 ${MUTED}`}>
          {t(`${NS}.wompiStatus`, { status: p.sweep.status || t(`${NS}.statusUnknown`) })}
        </p>
        {p.sweep.reason && <p className={`text-xs mt-1 break-words ${INK}`}>{p.sweep.reason}</p>}
        {p.sweep.checkedAt && (
          <p className={`text-xs ${MUTED}`}>{t(`${NS}.checkedAt`, { date: formatDateTime(p.sweep.checkedAt) })}</p>
        )}
      </>
    );
  };

  return (
    <section
      aria-labelledby="unbooked-payments-title"
      className="bg-white rounded-[var(--radius-xl)] border border-[var(--calico-danger)] p-4 flex flex-col gap-3"
    >
      <div className="flex items-start gap-3">
        <TriangleAlert className="w-5 h-5 shrink-0 text-[var(--calico-danger-strong)]" aria-hidden="true" />
        <div className="min-w-0">
          <h3 id="unbooked-payments-title" className={`text-sm font-semibold ${INK}`}>
            {t(`${NS}.title`)}{' '}
            <span className={`${CHIP} ${TONE.danger}`}>{state.items.length}</span>
          </h3>
          <p className={`text-xs ${MUTED}`}>{t(`${NS}.subtitle`)}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={TH}>{t(`${NS}.columns.reference`)}</th>
              <th className={TH}>{t(`${NS}.columns.student`)}</th>
              <th className={TH}>{t(`${NS}.columns.booking`)}</th>
              <th className={TH}>{t(`${NS}.columns.slot`)}</th>
              <th className={`${TH} text-right`}>{t(`${NS}.columns.amount`)}</th>
              <th className={TH}>{t(`${NS}.columns.transaction`)}</th>
              <th className={TH}>{t(`${NS}.columns.sweep`)}</th>
              <th className={TH}>{t(`${NS}.columns.action`)}</th>
            </tr>
          </thead>
          <tbody>
            {state.items.map((p) => {
              const result = results[p.reference];
              return (
                <tr key={p.reference} className={TR}>
                  <td className={`${TD} min-w-[11rem]`}>
                    <p className={`font-mono text-xs break-all ${INK}`}>{p.reference}</p>
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      <span className={`${CHIP} ${TONE.neutral}`}>{t(`${NS}.kind.${p.kind}`)}</span>
                    </div>
                    <p className={`text-xs mt-1 ${MUTED}`}>{t(`${NS}.createdAt`, { date: formatDateTime(p.createdAt) })}</p>
                  </td>
                  <td className={`${TD} min-w-[10rem]`}>
                    <p className={INK}>{p.student?.name || '—'}</p>
                    {p.student?.email && <p className={`text-xs break-all ${MUTED}`}>{p.student.email}</p>}
                  </td>
                  <td className={`${TD} min-w-[10rem]`}>{booking(p)}</td>
                  <td className={`${TD} whitespace-nowrap text-xs ${INK}`}>{p.slotStart ? formatDateTime(p.slotStart) : '—'}</td>
                  <td className={`${TD} text-right whitespace-nowrap font-semibold ${INK}`}>
                    {p.amount != null ? formatCurrency(p.amount, 'COP') : '—'}
                  </td>
                  <td className={`${TD} font-mono text-xs break-all ${INK}`}>{p.transactionId || '—'}</td>
                  <td className={`${TD} min-w-[10rem]`}>{sweepCell(p)}</td>
                  <td className={`${TD} min-w-[10rem]`}>
                    <Button size="sm" variant="outline" disabled={result?.busy} onClick={() => retry(p)}>
                      <RotateCcw />
                      {result?.busy ? t(`${NS}.retrying`) : t(`${NS}.retry`)}
                    </Button>
                    <div role="status" aria-live="polite" className="mt-1">
                      {result && !result.busy && (
                        <>
                          {result.code && <span className={`${CHIP} ${result.tone}`}>{result.code}</span>}
                          <p className={`text-xs mt-1 ${INK}`}>{t(result.labelKey)}</p>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details className="text-xs">
        <summary className={`cursor-pointer font-medium ${INK}`}>{t(`${NS}.help.title`)}</summary>
        <ul className={`mt-2 flex flex-col gap-1 list-disc pl-5 ${MUTED}`}>
          {HELP_KEYS.map((key) => <li key={key}>{t(`${NS}.help.${key}`)}</li>)}
        </ul>
      </details>
    </section>
  );
}
