'use client';

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid,
} from 'recharts';
import { useI18n } from '../../../../lib/i18n';

/**
 * Monthly Calico NET margin chart.
 *
 * The visible bar shows `calicoNet` (charged − tutor payouts − Wompi fee) so
 * it matches the "Net earnings this month" KPI above. The tooltip exposes
 * the full breakdown — charged, coupon discounts, tutor payout, Wompi fee,
 * calico net — so an admin can sanity-check where the net comes from.
 *
 * Series shape: [{ monthStart, gross, listGross, discount, calicoNet,
 *                  tutorPayout, wompiFee, paymentsCount }]
 * Every figure comes from the server (fees.js); nothing is derived here.
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
    };
  });

  const labels = {
    gross:       t('admin.charts.revenue.gross'),
    discount:    t('admin.charts.revenue.discount'),
    calicoNet:   t('admin.charts.revenue.calicoNet'),
    tutorPayout: t('admin.charts.revenue.tutorPayout'),
    wompiFee:    t('admin.charts.revenue.wompiFee'),
    payments:    t('admin.charts.revenue.payments'),
  };

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
            <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickFormatter={(v) => formatCurrency(v, 'COP').replace(/\s?COP\s?/i, '').trim()}
              />
              <Tooltip
                contentStyle={{ borderRadius: '0.75rem', border: '1px solid #e5e7eb', fontSize: 12 }}
                labelStyle={{ color: '#111827', fontWeight: 600 }}
                formatter={(value, name, item) => {
                  // Only the visible bar `calicoNet` triggers the tooltip; we
                  // pull the rest of the breakdown from its row and append
                  // them as additional lines.
                  if (name === 'calicoNet') {
                    const row = item?.payload || {};
                    return [
                      <div key="breakdown" className="flex flex-col gap-0.5">
                        <span><strong>{formatCurrency(row.calicoNet, 'COP')}</strong> · {labels.calicoNet}</span>
                        <span className="text-gray-500 text-[11px]">
                          {labels.gross}: {formatCurrency(row.gross, 'COP')}
                        </span>
                        {row.discount > 0 && (
                          <span className="text-gray-500 text-[11px]">
                            {labels.discount}: {formatCurrency(row.discount, 'COP')}
                          </span>
                        )}
                        <span className="text-gray-500 text-[11px]">
                          {labels.tutorPayout}: {formatCurrency(row.tutorPayout, 'COP')}
                        </span>
                        <span className="text-gray-500 text-[11px]">
                          {labels.wompiFee}: {formatCurrency(row.wompiFee, 'COP')}
                        </span>
                      </div>,
                      '',
                    ];
                  }
                  return [value, name];
                }}
              />
              <Bar dataKey="calicoNet" name="calicoNet" fill="#fb923c" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
