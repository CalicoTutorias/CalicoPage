'use client';

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { useI18n } from '../../../../lib/i18n';

const SUB = 'text-[11px] text-[var(--calico-body-muted)]';

/** One tooltip block per month: total, then the sessions and repasos breakdowns. */
export function RevenueTooltip({ active, payload, label, labels, money }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="flex flex-col gap-0.5 rounded-[var(--radius-lg)] border border-[var(--calico-slate-200)] bg-white px-3 py-2 text-xs shadow-sm">
      <span className="font-semibold text-[var(--calico-ink)]">{label}</span>
      <span><strong>{money(row.totalNet)}</strong> · {labels.totalNet}</span>

      <span className="mt-1 font-semibold text-[var(--calico-ink)]">{labels.sessions}: {money(row.calicoNet)}</span>
      <span className={SUB}>{labels.gross}: {money(row.gross)}</span>
      {row.discount > 0 && <span className={SUB}>{labels.discount}: {money(row.discount)}</span>}
      <span className={SUB}>{labels.tutorPayout}: {money(row.tutorPayout)}</span>
      <span className={SUB}>{labels.wompiFee}: {money(row.wompiFee)}</span>

      {row.eventsCount > 0 && (
        <>
          <span className="mt-1 font-semibold text-[var(--calico-ink)]">
            {labels.events} ({row.eventsCount}): {money(row.eventNet)}
          </span>
          <span className={SUB}>{labels.eventCollected}: {money(row.eventCollected)}</span>
          <span className={SUB}>{labels.tutorPayout}: {money(row.eventTutorPayout)}</span>
          <span className={SUB}>{labels.wompiFee}: {money(row.eventWompiFee)}</span>
        </>
      )}
    </div>
  );
}

/**
 * Monthly Calico NET margin chart.
 *
 * Two stacked bars per month — sessions `calicoNet` (charged − tutor payouts
 * − Wompi fee) and repasos `eventNet` (collected − tutor payouts − Wompi
 * fee) — so the stack matches the "Net earnings this month" KPI above. The
 * tooltip exposes both breakdowns so an admin can sanity-check where the
 * net comes from.
 *
 * Series shape: [{ monthStart, gross, listGross, discount, calicoNet,
 *                  tutorPayout, wompiFee, paymentsCount, eventsCount,
 *                  eventCollected, eventTutorPayout, eventWompiFee,
 *                  eventNet, totalNet }]
 * Every figure comes from the server (fees.js, event-earnings.js); nothing
 * is derived here.
 */
export default function RevenueChart({ series = [], loading = false }) {
  const { t, locale, formatCurrency } = useI18n();

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="h-6 w-40 bg-gray-100 rounded animate-pulse mb-3" />
        <div className="h-64 bg-gray-50 rounded-xl animate-pulse" />
      </div>
    );
  }

  const formatMonth = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', { month: 'short', year: '2-digit' });
  };

  const data = series.map((row) => {
    const gross       = Number(row.gross || 0);
    const calicoNet   = Number(row.calicoNet || 0);
    const tutorPayout = Number(row.tutorPayout || 0);
    // Served by the API. The old residual (gross − payout − net) no longer
    // holds once a coupon puts the tutor payout base above the charge, so it
    // is only a fallback for stale/legacy rows.
    const wompiFee = row.wompiFee != null
      ? Number(row.wompiFee)
      : Math.max(0, gross - tutorPayout - calicoNet);
    return {
      label: formatMonth(row.monthStart),
      gross,
      discount: Number(row.discount || 0),
      calicoNet,
      tutorPayout,
      wompiFee,
      payments: row.paymentsCount,
      eventsCount:      Number(row.eventsCount || 0),
      eventCollected:   Number(row.eventCollected || 0),
      eventTutorPayout: Number(row.eventTutorPayout || 0),
      eventWompiFee:    Number(row.eventWompiFee || 0),
      eventNet:         Number(row.eventNet || 0),
      totalNet:         row.totalNet != null ? Number(row.totalNet) : calicoNet,
    };
  });

  const labels = {
    gross:          t('admin.charts.revenue.gross'),
    discount:       t('admin.charts.revenue.discount'),
    calicoNet:      t('admin.charts.revenue.calicoNet'),
    tutorPayout:    t('admin.charts.revenue.tutorPayout'),
    wompiFee:       t('admin.charts.revenue.wompiFee'),
    payments:       t('admin.charts.revenue.payments'),
    sessions:       t('admin.charts.revenue.sessions'),
    events:         t('admin.charts.revenue.events'),
    totalNet:       t('admin.charts.revenue.totalNet'),
    eventCollected: t('admin.charts.revenue.eventCollected'),
  };
  const money = (n) => formatCurrency(n, 'COP');

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-1">
        {t('admin.charts.revenue.title')}
      </h3>
      <p className="text-xs text-gray-500 mb-3">
        {t('admin.charts.revenue.subtitle')}
      </p>

      {data.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-sm text-gray-400">
          {t('admin.charts.revenue.empty')}
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} stackOffset="sign" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickFormatter={(v) => formatCurrency(v, 'COP').replace(/\s?COP\s?/i, '').trim()}
              />
              <Tooltip content={<RevenueTooltip labels={labels} money={money} />} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11 }}
                formatter={(name) => (name === 'eventNet' ? labels.events : labels.sessions)}
              />
              <Bar dataKey="calicoNet" name="calicoNet" stackId="net" fill="#fb923c" />
              <Bar dataKey="eventNet" name="eventNet" stackId="net" fill="var(--calico-green)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
