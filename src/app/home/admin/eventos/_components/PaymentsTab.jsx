'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminEventService } from '@/app/services/core/AdminEventService';
import { useI18n } from '@/lib/i18n';
import { formatEventDate } from '@/lib/utils/event-format';
import ConfirmDialog from './ConfirmDialog';
import { CARD, CHIP, ERROR_BOX, INK, MUTED, TABLE_WRAP, TD, TH, TONE, TR } from './ui';

const TOTALS = ['gross', 'wompiFees', 'tutorPayouts', 'net', 'refundsPending', 'refunded'];
const FLAG_TONE = {
  DUPLICATE: TONE.danger,
  EVENT_CANCELED: TONE.warning,
  REGISTRATION_CANCELED: TONE.warning,
  EARLY_BIRD_OVERRUN: TONE.info,
};
const REFUND_METHODS = new Set(['llave', 'nequi', 'use_future_session']);

/**
 * Payments of one event: money totals, every payment with its anomaly flag,
 * and the refund queue. "Mark refunded" only records a refund Calico already
 * made by hand, so it always goes through a ConfirmDialog.
 */
export default function PaymentsTab({ eventId }) {
  const { t, formatCurrency, locale } = useI18n();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [refunding, setRefunding] = useState(null); // payment awaiting confirmation
  const [busy, setBusy] = useState(false);
  const [refundError, setRefundError] = useState(null);

  const load = useCallback(
    () => AdminEventService.payments(eventId).then((res) => {
      if (res.success) {
        setData({ payments: res.payments || [], totals: res.totals || {} });
        setLoadError(false);
      } else {
        setLoadError(true);
      }
    }),
    [eventId],
  );

  useEffect(() => { load(); }, [load]);

  const money = (n) => formatCurrency(n, 'COP');
  const methodLabel = (m) => (REFUND_METHODS.has(m) ? t(`events.cancel.methods.${m}`) : m);

  const confirmRefund = async () => {
    setBusy(true);
    setRefundError(null);
    const res = await AdminEventService.markRefunded(eventId, refunding.id);
    setBusy(false);
    if (!res.success) {
      setRefundError(res.error || t('admin.events.errors.generic'));
      return;
    }
    setRefunding(null);
    await load();
  };

  const closeDialog = () => {
    setRefunding(null);
    setRefundError(null);
  };

  if (loadError) return <p className={ERROR_BOX}>{t('admin.events.payments.load')}</p>;
  if (!data) return <p className={`text-sm ${MUTED}`}>{t('common.loading')}</p>;

  const { payments, totals } = data;
  const pendingCount = payments.filter((p) => p.refundStatus === 'Pending').length;

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {TOTALS.map((key) => (
          <div key={key} className={`${CARD} px-3 py-2 min-w-0 ${key === 'net' ? 'border-[var(--calico-orange)]' : ''}`}>
            <dt className={`text-xs uppercase tracking-wider ${MUTED}`}>{t(`admin.events.payments.totals.${key}`)}</dt>
            <dd className={`text-base font-semibold truncate ${INK}`}>{money(totals[key] ?? 0)}</dd>
          </div>
        ))}
      </dl>
      <p className={`text-xs ${MUTED}`}>{t('admin.events.payments.netHint')}</p>

      {pendingCount > 0 && (
        <p className={`${CHIP} ${TONE.warning} self-start gap-1`}>
          <AlertTriangle className="w-3.5 h-3.5" />
          {t('admin.events.payments.pendingCount', { count: pendingCount })}
        </p>
      )}

      {payments.length === 0 ? (
        <p className={`text-sm ${MUTED}`}>{t('admin.events.payments.empty')}</p>
      ) : (
        <div className={TABLE_WRAP}>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={TH}>{t('admin.events.payments.columns.user')}</th>
                <th className={TH}>{t('admin.events.payments.columns.date')}</th>
                <th className={`${TH} text-right`}>{t('admin.events.payments.columns.amount')}</th>
                <th className={TH}>{t('admin.events.payments.columns.reference')}</th>
                <th className={TH}>{t('admin.events.payments.columns.flag')}</th>
                <th className={TH}>{t('admin.events.payments.columns.refund')}</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className={TR}>
                  <td className={TD}>
                    <p className={`font-medium ${INK}`}>{p.user?.name || '—'}</p>
                    <p className={`text-xs ${MUTED}`}>{p.user?.email || ''}</p>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-xs ${MUTED}`}>{formatEventDate(p.createdAt, locale)}</td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    <p className={`font-semibold ${INK}`}>{money(p.amount)}</p>
                    {Number(p.discountAmount) > 0 && (
                      <p className={`text-xs ${MUTED}`}>
                        {t('admin.events.payments.listPrice', { original: money(p.originalAmount), discount: money(p.discountAmount) })}
                      </p>
                    )}
                  </td>
                  <td className={`${TD} font-mono text-xs ${MUTED} break-all`}>{p.wompiId}</td>
                  <td className={TD}>
                    {p.flag && (
                      <span className={`${CHIP} ${FLAG_TONE[p.flag] || TONE.neutral}`}>
                        {t(`admin.events.payments.flags.${p.flag}`)}
                      </span>
                    )}
                  </td>
                  <td className={`${TD} min-w-[12rem]`}>
                    {p.refundStatus === 'Pending' && (
                      <div className="flex flex-col gap-1.5 items-start">
                        <span className={`${CHIP} ${TONE.warning}`}>{t('admin.events.payments.refundStatus.Pending')}</span>
                        {p.refundMethod ? (
                          <p className={`text-xs ${INK}`}>
                            <span className="font-medium">{methodLabel(p.refundMethod)}</span>
                            {p.refundMethodDetails && <span className="block break-all">{p.refundMethodDetails}</span>}
                          </p>
                        ) : (
                          <p className={`text-xs ${MUTED}`}>{t('admin.events.payments.noMethod')}</p>
                        )}
                        <Button size="sm" variant="outline" onClick={() => setRefunding(p)}>
                          {t('admin.events.payments.markRefunded')}
                        </Button>
                      </div>
                    )}
                    {p.refundStatus === 'Refunded' && (
                      <span className={`${CHIP} ${TONE.success}`}>
                        {t('admin.events.payments.refundStatus.Refunded', { date: p.refundedAt ? formatEventDate(p.refundedAt, locale) : '' })}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(refunding)}
        title={t('admin.events.payments.confirmRefund.title')}
        message={refunding && t('admin.events.payments.confirmRefund.body', {
          amount: money(refunding.amount),
          name: refunding.user?.name || refunding.user?.email || '—',
        })}
        confirmLabel={t('admin.events.payments.confirmRefund.confirm')}
        busy={busy}
        error={refundError}
        onConfirm={confirmRefund}
        onCancel={closeDialog}
      />
    </div>
  );
}
