'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Clock, PiggyBank, Users, Wallet } from 'lucide-react';
import routes from '@/routes';
import { AdminFinanceService } from '@/app/services/core/AdminFinanceService';
import { useI18n } from '@/lib/i18n';
import KpiCard from '../../_components/KpiCard';
import {
  CARD, ERROR_BOX, INK, INPUT, LABEL, MUTED, TABLE_WRAP, TD, TH, TR,
} from '../../eventos/_components/ui';
import { currentMonth, errorText, monthRange } from './format';

/**
 * Caja por cuenta, lo que se debe, lo disponible y la ganancia del mes
 * elegido junto a la acumulada desde la fecha de corte.
 */
export default function SummaryTab({ config }) {
  const { t, formatCurrency, formatDate } = useI18n();
  const money = (n) => formatCurrency(n ?? 0, 'COP');
  const monthId = useId();
  const [month, setMonth] = useState(currentMonth);
  const [state, setState] = useState({ status: 'loading', summary: null, error: null });

  useEffect(() => {
    let ignore = false;
    AdminFinanceService.getSummary(monthRange(month)).then((res) => {
      if (ignore) return;
      setState(res.success
        ? { status: 'ready', summary: res.summary, error: null }
        : { status: 'error', summary: null, error: errorText(t, res) });
    });
    return () => { ignore = true; };
  }, [month, t]);

  const s = state.summary;
  const cutoff = config.settings.cutoffDate;

  const profitRows = (p) => [
    ['sessions', p.sessions.net, t('admin.finance.summary.profit.sessionsDetail', { count: p.sessions.count, gross: money(p.sessions.gross) })],
    ['events', p.events.net, t('admin.finance.summary.profit.eventsDetail', { count: p.events.count, collected: money(p.events.collected) })],
    ['gmf', -p.gmf, null],
    ['expenses', -p.expenses, null],
    ['otherIncome', p.otherIncome, null],
    ['adjustments', p.adjustments, null],
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <label htmlFor={monthId} className={LABEL}>{t('admin.finance.summary.month')}</label>
          <input id={monthId} type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={INPUT} />
        </div>
        {cutoff && (
          <p className={`text-xs ${MUTED}`}>
            {t('admin.finance.summary.since', { date: formatDate(cutoff, { day: 'numeric', month: 'long', year: 'numeric' }) })}
          </p>
        )}
      </div>

      {state.status === 'loading' && <p className={`text-sm ${MUTED}`}>{t('common.loading')}</p>}
      {state.status === 'error' && <p className={ERROR_BOX}>{state.error}</p>}

      {s && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard icon={Wallet} tone="blue" label={t('admin.finance.summary.cash')} value={money(s.cash)} />
            {/* Same figure as "Total a transferir" in Pagos a tutores: click to pay. */}
            <Link
              href={routes.ADMIN_PAYOUTS}
              title={t('admin.finance.summary.owedLink')}
              className="rounded-2xl transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-[var(--calico-orange)]"
            >
              <KpiCard
                icon={Users}
                tone="amber"
                label={t('admin.finance.summary.owed')}
                value={money(s.owed.total)}
                sub={t('admin.finance.summary.owedHint', { sessions: money(s.owed.sessions), events: money(s.owed.events) })}
              />
            </Link>
            <KpiCard
              icon={Clock}
              tone="orange"
              label={t('admin.finance.summary.committed')}
              value={money(s.owed.upcomingSessions + s.owed.pendingRefunds)}
              sub={t('admin.finance.summary.committedHint', {
                upcoming: money(s.owed.upcomingSessions), refunds: money(s.owed.pendingRefunds),
              })}
            />
            <KpiCard icon={PiggyBank} tone="emerald" label={t('admin.finance.summary.available')} value={money(s.available)} sub={t('admin.finance.summary.availableHint')} />
          </div>

          <div className={TABLE_WRAP}>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={TH}>{t('admin.finance.summary.accounts.account')}</th>
                  <th className={`${TH} text-right`}>{t('admin.finance.summary.accounts.balance')}</th>
                </tr>
              </thead>
              <tbody>
                {s.accounts.filter((a) => a.isActive || a.balance !== 0).map((a) => (
                  <tr key={a.id} className={TR}>
                    <td className={`${TD} ${INK}`}>
                      {a.name}
                      <span className={`ml-2 text-xs ${MUTED}`}>{t(`admin.finance.accountTypes.${a.type}`)}</span>
                    </td>
                    <td className={`${TD} text-right font-semibold whitespace-nowrap ${a.balance < 0 ? 'text-[var(--calico-danger-strong)]' : INK}`}>
                      {money(a.balance)}
                    </td>
                  </tr>
                ))}
                <tr className={TR}>
                  <td className={`${TD} font-semibold ${INK}`}>{t('admin.finance.summary.accounts.total')}</td>
                  <td className={`${TD} text-right font-bold ${INK}`}>{money(s.cash)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className={`${CARD} p-4 flex flex-col gap-3`}>
            <h2 className={`text-sm font-bold ${INK}`}>{t('admin.finance.summary.profit.title')}</h2>
            <p className={`text-xs ${MUTED}`}>{t('admin.finance.summary.profit.hint')}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={TH}>{t('admin.finance.summary.profit.concept')}</th>
                    <th className={`${TH} text-right`}>{t('admin.finance.summary.profit.month')}</th>
                    <th className={`${TH} text-right`}>{t('admin.finance.summary.profit.sinceCutoff')}</th>
                  </tr>
                </thead>
                <tbody>
                  {profitRows(s.profit.period).map(([key, value, detail], i) => {
                    const total = profitRows(s.profit.sinceCutoff)[i][1];
                    return (
                      <tr key={key} className={TR}>
                        <td className={`${TD} ${INK}`}>
                          {t(`admin.finance.summary.profit.${key}`)}
                          {detail && <p className={`text-xs ${MUTED}`}>{detail}</p>}
                        </td>
                        <td className={`${TD} text-right whitespace-nowrap ${INK}`}>{money(value)}</td>
                        <td className={`${TD} text-right whitespace-nowrap ${MUTED}`}>{money(total)}</td>
                      </tr>
                    );
                  })}
                  <tr className={TR}>
                    <td className={`${TD} font-bold ${INK}`}>{t('admin.finance.summary.profit.total')}</td>
                    <td className={`${TD} text-right font-bold whitespace-nowrap ${s.profit.period.total < 0 ? 'text-[var(--calico-danger-strong)]' : INK}`}>
                      {money(s.profit.period.total)}
                    </td>
                    <td className={`${TD} text-right font-bold whitespace-nowrap ${s.profit.sinceCutoff.total < 0 ? 'text-[var(--calico-danger-strong)]' : INK}`}>
                      {money(s.profit.sinceCutoff.total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {s.profit.period.expensesByCategory.length > 0 && (
              <div>
                <h3 className={`text-xs font-semibold ${INK} mb-1`}>{t('admin.finance.summary.profit.byCategory')}</h3>
                <ul className={`text-xs ${MUTED} flex flex-col gap-0.5`}>
                  {s.profit.period.expensesByCategory.map((c) => (
                    <li key={c.name}>{c.name}: {money(c.amount)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
