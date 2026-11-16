'use client';

import { useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import TutorPayoutsTab from '../../eventos/_components/TutorPayoutsTab';
import { CHIP, INK, MUTED, TABLE_WRAP, TD, TH, TONE, TR } from '../../eventos/_components/ui';

/**
 * Repasos whose tutors still have money to receive. "Pagar" opens the
 * repaso's tutor payouts (amount, account, date and proof per tutor);
 * closing it reloads the totals.
 *
 * Repasos held under the old rule were already paid and never show here.
 */
export default function EventPayoutsTable({ events, onChanged }) {
  const { t, formatCurrency, formatDate } = useI18n();
  const money = (n) => formatCurrency(n ?? 0, 'COP');
  const [paying, setPaying] = useState(null);

  const close = () => {
    setPaying(null);
    onChanged();
  };

  if (events.length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl px-6 py-16 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
        <p className={`text-sm ${MUTED}`}>{t('admin.payouts.events.empty')}</p>
      </div>
    );
  }

  return (
    <>
      <div className={TABLE_WRAP}>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={TH}>{t('admin.payouts.events.columns.event')}</th>
              <th className={TH}>{t('admin.payouts.events.columns.tutors')}</th>
              <th className={`${TH} text-right`}>{t('admin.payouts.events.columns.owed')}</th>
              <th className={`${TH} text-right`}>{t('admin.payouts.events.columns.remaining')}</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className={TR}>
                <td className={`${TD} ${INK}`}>
                  <div className="font-medium">{e.title}</div>
                  <div className={`text-xs ${MUTED}`}>
                    {e.course?.code} · {formatDate(e.startsAt, { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}{t('admin.payouts.events.confirmed', { count: e.confirmed })}
                  </div>
                </td>
                <td className={TD}>
                  <ul className="flex flex-col gap-1">
                    {e.tutors.map((tu) => (
                      <li key={tu.id} className="text-xs">
                        <span className={INK}>{tu.name}</span>
                        {tu.remaining > 0 && <span className={MUTED}> · {money(tu.remaining)}</span>}
                        {tu.llave
                          ? <span className={`ml-1 font-mono ${MUTED}`}>{tu.llave}</span>
                          : <span className={`${CHIP} ${TONE.warning} ml-1`}>{t('admin.payouts.noLlave')}</span>}
                      </li>
                    ))}
                  </ul>
                </td>
                <td className={`${TD} text-right whitespace-nowrap ${MUTED}`}>
                  {money(e.tutorPayout)}
                  {e.tutorPaid > 0 && <div className="text-xs">{t('admin.payouts.events.paid', { amount: money(e.tutorPaid) })}</div>}
                </td>
                <td className={`${TD} text-right whitespace-nowrap font-semibold text-[var(--calico-green-success-dark)]`}>
                  {money(e.tutorRemaining)}
                </td>
                <td className={`${TD} text-right`}>
                  <Button size="sm" variant="cta" onClick={() => setPaying(e)}>{t('admin.payouts.events.pay')}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {paying && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('admin.payouts.events.dialogTitle', { title: paying.title })}
            className="bg-white rounded-[var(--radius-xl)] p-6 w-full max-w-3xl shadow-xl max-h-[90vh] overflow-y-auto flex flex-col gap-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className={`text-lg font-semibold ${INK}`}>{t('admin.payouts.events.dialogTitle', { title: paying.title })}</h2>
                <p className={`text-xs ${MUTED}`}>
                  {t('admin.payouts.events.dialogHint', { remaining: money(paying.tutorRemaining) })}
                </p>
              </div>
              <Button size="icon-sm" variant="ghost" onClick={close} aria-label={t('admin.tutorDetail.modals.common.cancel')}>
                <X />
              </Button>
            </div>
            <ul className={`text-xs ${MUTED} flex flex-col gap-0.5`}>
              {paying.tutors.map((tu) => (
                <li key={tu.id}>
                  {tu.name}: {t('admin.payouts.events.tutorLine', { owed: money(tu.owed), paid: money(tu.paid), remaining: money(tu.remaining) })}
                </li>
              ))}
            </ul>
            <TutorPayoutsTab eventId={paying.id} tutors={paying.tutors.map(({ id, name }) => ({ id, name }))} />
          </div>
        </div>
      )}
    </>
  );
}
