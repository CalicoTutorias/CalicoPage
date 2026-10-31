'use client';

import Link from 'next/link';
import { useI18n } from '../../../../lib/i18n';
import { CHIP, ERROR_BOX, INK, MUTED, TD, TH, TONE, TR, percent } from '../eventos/_components/ui';

const PAYMENT_TONE = {
  manual: TONE.neutral,
  wompi:  TONE.info,
  free:   TONE.neutral,
};

/**
 * Per-repaso earnings under the dashboard charts: for every published
 * repaso, what was collected, what its tutors are owed (split per tutor,
 * and what was already recorded as paid), the Wompi fee Calico absorbs and
 * Calico's net. Every number comes from the server
 * (src/lib/payments/event-earnings.js); nothing is derived here.
 *
 * Props: data = { items, totals: { held, upcoming }, policy } from
 * GET /api/admin/metrics/event-earnings, or null; loading; error.
 */
export default function EventEarningsTable({ data = null, loading = false, error = false }) {
  const { t, formatCurrency, formatDate, formatDateTime } = useI18n();
  const money = (n) => formatCurrency(n, 'COP');
  const time = (d) => formatDateTime(d, { hour: 'numeric', minute: '2-digit' });

  const items = data?.items ?? [];
  const policy = data?.policy;
  const held = data?.totals?.held;
  const upcoming = data?.totals?.upcoming;

  const statusChip = (e) => {
    if (!e.meetsMinimum) return { tone: TONE.warning, key: 'belowMinimum' };
    return e.upcoming ? { tone: TONE.info, key: 'upcoming' } : { tone: TONE.success, key: 'held' };
  };

  return (
    <div className="bg-white rounded-[var(--radius-xl)] border border-[var(--calico-slate-100)] p-4">
      <div className="mb-3">
        <h3 className={`text-sm font-semibold ${INK}`}>{t('admin.dashboard.events.title')}</h3>
        {policy && (
          <p className={`text-xs ${MUTED}`}>
            {t('admin.dashboard.events.subtitle', {
              rate:  money(policy.tutorHourlyRate),
              min:   policy.minConfirmed,
              share: percent(policy.extraStudentTutorShare),
            })}
          </p>
        )}
        {!loading && !error && items.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            <span className={`${CHIP} ${TONE.success}`}>
              {t('admin.dashboard.events.held', { net: money(held?.calicoNet ?? 0), count: held?.events ?? 0 })}
            </span>
            <span className={`${CHIP} ${TONE.info}`}>
              {t('admin.dashboard.events.upcoming', { net: money(upcoming?.calicoNet ?? 0), count: upcoming?.events ?? 0 })}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-[var(--calico-slate-50)] rounded-[var(--radius-lg)] animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <p className={ERROR_BOX}>{t('admin.dashboard.errors.events')}</p>
      ) : items.length === 0 ? (
        <p className={`py-8 text-center text-sm ${MUTED}`}>{t('admin.dashboard.events.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={TH}>{t('admin.dashboard.events.columns.event')}</th>
                <th className={TH}>{t('admin.dashboard.events.columns.payment')}</th>
                <th className={TH}>{t('admin.dashboard.events.columns.confirmed')}</th>
                <th className={`${TH} text-right`}>{t('admin.dashboard.events.columns.collected')}</th>
                <th className={`${TH} text-right`}>{t('admin.dashboard.events.columns.tutors')}</th>
                <th className={`${TH} text-right`}>{t('admin.dashboard.events.columns.wompi')}</th>
                <th className={`${TH} text-right`}>{t('admin.dashboard.events.columns.calicoNet')}</th>
                <th className={TH}>{t('admin.dashboard.events.columns.status')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => {
                const status = statusChip(e);
                return (
                  <tr key={e.id} className={TR}>
                    <td className={`${TD} min-w-[14rem]`}>
                      <Link
                        href={`/home/admin/eventos/${e.id}`}
                        className={`font-medium ${INK} hover:underline`}
                      >
                        {e.title}
                      </Link>
                      <p className={`text-xs ${MUTED}`}>
                        {formatDate(e.startsAt, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                        {' · '}{time(e.startsAt)} – {time(e.endsAt)}
                        {' · '}{t('admin.dashboard.events.hours', { hours: e.hours })}
                      </p>
                      {e.course?.code && <p className={`text-xs ${MUTED}`}>{e.course.code}</p>}
                    </td>
                    <td className={TD}>
                      <span className={`${CHIP} ${PAYMENT_TONE[e.paymentMode] || TONE.neutral}`}>
                        {t(`admin.dashboard.events.payment.${e.paymentMode}`)}
                      </span>
                    </td>
                    <td className={`${TD} whitespace-nowrap ${INK}`}>
                      {t('admin.dashboard.events.confirmedOf', { confirmed: e.confirmed, min: e.minConfirmed })}
                    </td>
                    <td className={`${TD} text-right whitespace-nowrap ${INK}`}>{money(e.collected)}</td>
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      <p className={`font-semibold ${INK}`}>{money(e.tutorPayout)}</p>
                      {e.meetsMinimum && (
                        <p className={`text-xs ${MUTED}`}>
                          {t('admin.dashboard.events.tutorBreakdown', { base: money(e.tutorBase), extra: money(e.tutorExtra) })}
                        </p>
                      )}
                      {e.meetsMinimum && e.tutors.length > 1 && e.tutors.map((tutor) => (
                        <p key={tutor.id} className={`text-xs ${MUTED}`}>{tutor.name}: {money(tutor.owed)}</p>
                      ))}
                      {e.tutorPaid > 0 && (
                        <p className={`text-xs ${MUTED}`}>{t('admin.dashboard.events.tutorPaid', { amount: money(e.tutorPaid) })}</p>
                      )}
                    </td>
                    <td className={`${TD} text-right whitespace-nowrap ${MUTED}`}>
                      {e.paymentMode === 'wompi' ? money(e.wompiFees) : '—'}
                    </td>
                    <td className={`${TD} text-right whitespace-nowrap font-semibold ${
                      e.calicoNet < 0 ? 'text-[var(--calico-danger-strong)]' : INK
                    }`}
                    >
                      {money(e.calicoNet)}
                    </td>
                    <td className={TD}>
                      <span className={`${CHIP} ${status.tone}`}>{t(`admin.dashboard.events.status.${status.key}`)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
