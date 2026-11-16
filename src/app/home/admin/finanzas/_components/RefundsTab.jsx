'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AdminFinanceService } from '@/app/services/core/AdminFinanceService';
import { useI18n } from '@/lib/i18n';
import ConfirmDialog from '../../eventos/_components/ConfirmDialog';
import {
  CARD, CHIP, ERROR_BOX, HINT, INK, INPUT, LABEL, MUTED, TABLE_WRAP, TD, TH, TONE, TR,
} from '../../eventos/_components/ui';
import TransferFields, { buildTransfer, emptyTransfer } from './TransferFields';
import { errorText } from './format';

/**
 * Tutoring payments of sessions that were canceled or rejected and not
 * refunded yet, plus the refunds already made. Refunds of repasos stay in
 * each event's Payments tab.
 */
export default function RefundsTab() {
  const { t, formatCurrency, formatDate } = useI18n();
  const money = (n) => formatCurrency(n ?? 0, 'COP');
  const uid = useId();
  const id = (n) => `${uid}-${n}`;
  const [data, setData] = useState({ status: 'loading', pending: [], refunded: [], error: null });
  const [refunding, setRefunding] = useState(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [transfer, setTransfer] = useState(emptyTransfer);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState(null);

  const apply = useCallback((res) => {
    setData(res.success
      ? { status: 'ready', pending: res.pending, refunded: res.refunded, error: null }
      : { status: 'error', pending: [], refunded: [], error: errorText(t, res) });
  }, [t]);

  const load = useCallback(() => AdminFinanceService.listSessionRefunds().then(apply), [apply]);

  useEffect(() => {
    let ignore = false;
    AdminFinanceService.listSessionRefunds().then((res) => { if (!ignore) apply(res); });
    return () => { ignore = true; };
  }, [apply]);

  const close = () => {
    setRefunding(null);
    setAmount('');
    setReason('');
    setDialogError(null);
    setTransfer((prev) => ({ ...emptyTransfer(), accountId: prev.accountId }));
  };

  const confirm = async () => {
    const partial = amount.trim() === '' ? null : Number(amount);
    if (partial !== null && (!Number.isFinite(partial) || partial <= 0 || partial > refunding.amount)) {
      setDialogError(t('admin.finance.refund.amountInvalid'));
      return;
    }
    if (!reason.trim()) {
      setDialogError(t('admin.finance.rules.REASON_REQUIRED'));
      return;
    }
    setBusy(true);
    setDialogError(null);
    const built = await buildTransfer(transfer);
    if (!built.ok) {
      setBusy(false);
      setDialogError(t(built.errorKey));
      return;
    }
    const res = await AdminFinanceService.refundSessionPayment({
      paymentId: refunding.paymentId,
      ...(partial !== null ? { amount: partial } : {}),
      reason: reason.trim(),
      accountId: built.transfer.accountId,
      refundedAt: built.transfer.paidAt,
      ...(built.transfer.proofS3Key ? { proofS3Key: built.transfer.proofS3Key } : {}),
    });
    setBusy(false);
    if (!res.success) {
      setDialogError(errorText(t, res));
      return;
    }
    close();
    await load();
  };

  const sessionCell = (r) => (
    <td className={`${TD} ${INK}`}>
      <div>{r.session?.course?.name}</div>
      <div className={`text-xs ${MUTED}`}>
        {formatDate(r.session?.startTimestamp, { day: 'numeric', month: 'short', year: 'numeric' })}
        {' · '}{r.tutor?.name}
      </div>
    </td>
  );

  if (data.status === 'loading') return <p className={`text-sm ${MUTED}`}>{t('common.loading')}</p>;
  if (data.status === 'error') return <p className={ERROR_BOX}>{data.error}</p>;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h2 className={`text-sm font-bold ${INK}`}>{t('admin.finance.refunds.pendingTitle')}</h2>
        <p className={`text-xs ${MUTED}`}>{t('admin.finance.refunds.pendingHint')}</p>
        {data.pending.length === 0 ? (
          <p className={`${CARD} p-5 text-sm ${MUTED}`}>{t('admin.finance.refunds.pendingEmpty')}</p>
        ) : (
          <div className={TABLE_WRAP}>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={TH}>{t('admin.finance.refunds.columns.session')}</th>
                  <th className={TH}>{t('admin.finance.refunds.columns.student')}</th>
                  <th className={TH}>{t('admin.finance.refunds.columns.status')}</th>
                  <th className={`${TH} text-right`}>{t('admin.finance.refunds.columns.charged')}</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {data.pending.map((r) => (
                  <tr key={r.paymentId} className={TR}>
                    {sessionCell(r)}
                    <td className={`${TD} ${INK}`}>
                      <div>{r.student?.name}</div>
                      <div className={`text-xs ${MUTED}`}>{r.student?.email}</div>
                    </td>
                    <td className={TD}>
                      <span className={`${CHIP} ${TONE.warning}`}>{r.session?.status}</span>
                      {r.tutorAlreadyPaid && <p className={`${HINT} mt-1`}>{t('admin.finance.refunds.tutorAlreadyPaid')}</p>}
                    </td>
                    <td className={`${TD} text-right whitespace-nowrap font-semibold ${INK}`}>{money(r.amount)}</td>
                    <td className={TD}>
                      <Button size="sm" variant="outline" onClick={() => setRefunding(r)}>{t('admin.finance.refunds.refund')}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={`text-sm font-bold ${INK}`}>{t('admin.finance.refunds.doneTitle')}</h2>
        {data.refunded.length === 0 ? (
          <p className={`${CARD} p-5 text-sm ${MUTED}`}>{t('admin.finance.refunds.doneEmpty')}</p>
        ) : (
          <div className={TABLE_WRAP}>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={TH}>{t('admin.finance.refunds.columns.session')}</th>
                  <th className={TH}>{t('admin.finance.refunds.columns.reason')}</th>
                  <th className={TH}>{t('admin.finance.refunds.columns.refundedAt')}</th>
                  <th className={`${TH} text-right`}>{t('admin.finance.refunds.columns.refunded')}</th>
                </tr>
              </thead>
              <tbody>
                {data.refunded.map((r) => (
                  <tr key={r.paymentId} className={TR}>
                    {sessionCell(r)}
                    <td className={`${TD} text-xs ${MUTED}`}>{r.refundReason || '—'}</td>
                    <td className={`${TD} whitespace-nowrap text-xs ${MUTED}`}>
                      {r.refundedAt ? formatDate(r.refundedAt, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className={`${TD} text-right whitespace-nowrap font-semibold ${INK}`}>
                      {money(r.refundAmount ?? r.amount)}
                      {r.refundAmount != null && r.refundAmount < r.amount && (
                        <div className={`text-xs ${MUTED}`}>{t('admin.finance.refunds.ofCharged', { amount: money(r.amount) })}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(refunding)}
        title={t('admin.finance.refunds.dialogTitle')}
        message={refunding && t('admin.finance.refunds.dialogBody', {
          amount: money(refunding.amount),
          name: refunding.student?.name || refunding.student?.email || '—',
        })}
        confirmLabel={t('admin.finance.refunds.refund')}
        busy={busy}
        error={dialogError}
        onConfirm={confirm}
        onCancel={close}
      >
        <div className="flex flex-col gap-3 mt-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={id('amount')} className={LABEL}>{t('admin.finance.refund.amount')}</label>
            <input
              id={id('amount')} type="number" inputMode="numeric" min={1} step={1}
              value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder={refunding ? String(refunding.amount) : ''} disabled={busy} className={INPUT}
            />
            <p className={HINT}>{t('admin.finance.refund.amountHint')}</p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={id('reason')} className={LABEL}>{t('admin.finance.refunds.reason')}</label>
            <input
              id={id('reason')} type="text" maxLength={500}
              value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} className={INPUT}
            />
          </div>
          <TransferFields value={transfer} onChange={setTransfer} disabled={busy} />
        </div>
      </ConfirmDialog>
    </div>
  );
}
