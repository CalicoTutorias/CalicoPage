'use client';

import { AlertTriangle } from 'lucide-react';
import { useI18n } from '../../../../lib/i18n';
import MetricInfo from './MetricInfo';

/**
 * Per-course profitability table. Rows where Calico's net is ≤ 0 at the
 * volume they ran are tinted rose and flagged, so admins can spot courses
 * priced below the Wompi-fee break-even.
 *
 * Props:
 *  - items: [{ id, code, name, sessions, gross, calicoNet, margin,
 *              netPerSession, listPrice, breakEvenPrice, unprofitable }]
 *  - loading
 *  - days: range label
 */
export default function CourseProfitabilityTable({ items = [], loading = false, days = 90 }) {
  const { t, formatCurrency } = useI18n();

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-800">{t('admin.growth.profitability.title')}</h3>
        <span className="text-[11px] text-gray-500">{t('admin.growth.profitability.rangeLabel', { days })}</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">{t('admin.growth.profitability.subtitle')}</p>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-gray-50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">{t('admin.growth.profitability.empty')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500">
                <th className="px-3 py-2 text-left font-semibold">{t('admin.growth.profitability.table.course')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('admin.growth.profitability.table.sessions')}</th>
                <th className="px-3 py-2 font-semibold">
                  <span className="flex items-center justify-end gap-1">
                    {t('admin.growth.profitability.table.gross')}<MetricInfo baseKey="admin.growth.info.gross" />
                  </span>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <span className="flex items-center justify-end gap-1">
                    {t('admin.growth.profitability.table.calicoNet')}<MetricInfo baseKey="admin.growth.info.calicoNet" />
                  </span>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <span className="flex items-center justify-end gap-1">
                    {t('admin.growth.profitability.table.margin')}<MetricInfo baseKey="admin.growth.info.margin" />
                  </span>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <span className="flex items-center justify-end gap-1">
                    {t('admin.growth.profitability.table.netPerSession')}<MetricInfo baseKey="admin.growth.info.netPerSession" />
                  </span>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <span className="flex items-center justify-end gap-1">
                    {t('admin.growth.profitability.table.listPrice')}<MetricInfo baseKey="admin.growth.info.listPrice" />
                  </span>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <span className="flex items-center justify-end gap-1">
                    {t('admin.growth.profitability.table.breakEven')}<MetricInfo baseKey="admin.growth.info.breakEven" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr
                  key={c.id}
                  className={`border-t border-gray-50 ${c.unprofitable ? 'bg-rose-50/60' : ''}`}
                >
                  <td className="px-3 py-2 min-w-[12rem]">
                    <div className="flex items-center gap-2">
                      {c.unprofitable && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded-md flex-shrink-0"
                          title={t('admin.growth.profitability.unprofitableTitle')}
                        >
                          <AlertTriangle className="w-3 h-3" />
                          {t('admin.growth.profitability.unprofitableFlag')}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">{c.name}</p>
                        {c.code && <p className="text-[11px] text-gray-500">{c.code}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">{c.sessions}</td>
                  <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                    {formatCurrency(c.gross, 'COP')}
                  </td>
                  <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${c.calicoNet < 0 ? 'text-rose-600' : 'text-gray-900'}`}>
                    {formatCurrency(c.calicoNet, 'COP')}
                  </td>
                  <td className={`px-3 py-2 text-right whitespace-nowrap ${c.margin < 0 ? 'text-rose-600' : 'text-gray-700'}`}>
                    {Math.round(c.margin * 100)}%
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                    {formatCurrency(c.netPerSession, 'COP')}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                    {c.listPrice != null ? formatCurrency(c.listPrice, 'COP') : t('admin.growth.profitability.noPrice')}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-400 whitespace-nowrap">
                    {formatCurrency(c.breakEvenPrice, 'COP')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
