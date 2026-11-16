'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileText, Plus, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminFinanceService } from '@/app/services/core/AdminFinanceService';
import { useI18n } from '@/lib/i18n';
import ConfirmDialog from '../../eventos/_components/ConfirmDialog';
import {
  CARD, CHIP, ERROR_BOX, HINT, INK, INPUT, LABEL, MUTED, TABLE_WRAP, TD, TH, TONE, TR,
} from '../../eventos/_components/ui';
import EntryFormModal from './EntryFormModal';
import { dayStartIso, errorText } from './format';

const PAGE_SIZE = 50;
const TYPES = [
  'OPENING_BALANCE', 'SESSION_CHARGE', 'EVENT_CHARGE', 'WOMPI_FEE', 'TUTOR_PAYOUT', 'EVENT_TUTOR_PAYOUT',
  'GMF', 'REFUND', 'TRANSFER', 'EXPENSE', 'OTHER_INCOME', 'ADJUSTMENT', 'REVERSAL',
];

/** Every movement, newest first, with its proof; manual ones are recorded and reversed here. */
export default function EntriesTab({ config }) {
  const { t, formatCurrency, formatDate } = useI18n();
  const uid = useId();
  const id = (n) => `${uid}-${n}`;
  const [filters, setFilters] = useState({ accountId: '', type: '', from: '', to: '' });
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [list, setList] = useState({ status: 'loading', items: [], total: 0, error: null });
  const [creating, setCreating] = useState(false);
  const [reversing, setReversing] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const query = useCallback(() => ({
    accountId: filters.accountId || undefined,
    type: filters.type || undefined,
    from: filters.from ? dayStartIso(filters.from) : undefined,
    // `to` is inclusive in the form: up to the start of the next day.
    to: filters.to ? new Date(new Date(dayStartIso(filters.to)).getTime() + 864e5).toISOString() : undefined,
  }), [filters]);

  useEffect(() => {
    let ignore = false;
    AdminFinanceService.listEntries({ ...query(), limit: PAGE_SIZE, offset: page * PAGE_SIZE }).then((res) => {
      if (ignore) return;
      setList(res.success
        ? { status: 'ready', items: res.items, total: res.total, error: null }
        : { status: 'error', items: [], total: 0, error: errorText(t, res) });
    });
    return () => { ignore = true; };
  }, [query, page, reload, t]);

  const setFilter = (k, v) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(0);
  };

  const openProof = async (entryId) => {
    setActionError(null);
    // Opened synchronously so the popup is not blocked; filled once the URL arrives.
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    const res = await AdminFinanceService.getEntryProofUrl(entryId);
    if (res.success && win) win.location.href = res.url;
    else {
      win?.close();
      setActionError(errorText(t, res));
    }
  };

  const exportCsv = async () => {
    setActionError(null);
    const res = await AdminFinanceService.exportEntriesCsv(query());
    if (!res.success) {
      setActionError(t('admin.finance.errors.generic'));
      return;
    }
    const url = URL.createObjectURL(res.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'calico-movimientos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const confirmReverse = async () => {
    setBusy(true);
    setDialogError(null);
    const res = await AdminFinanceService.reverseEntry(reversing.id, reason.trim());
    setBusy(false);
    if (!res.success) {
      setDialogError(errorText(t, res));
      return;
    }
    setReversing(null);
    setReason('');
    setReload((n) => n + 1);
  };

  const accountName = (e) => e.account?.name ?? config.accounts.find((a) => a.id === e.account?.id)?.name ?? '—';
  const totalPages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className={`${CARD} p-4 flex items-end gap-3 flex-wrap`}>
        <div className="flex flex-col gap-1">
          <label htmlFor={id('account')} className={LABEL}>{t('admin.finance.entries.filters.account')}</label>
          <select id={id('account')} value={filters.accountId} onChange={(e) => setFilter('accountId', e.target.value)} className={INPUT}>
            <option value="">{t('admin.finance.entries.filters.all')}</option>
            {config.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={id('type')} className={LABEL}>{t('admin.finance.entries.filters.type')}</label>
          <select id={id('type')} value={filters.type} onChange={(e) => setFilter('type', e.target.value)} className={INPUT}>
            <option value="">{t('admin.finance.entries.filters.all')}</option>
            {TYPES.map((k) => <option key={k} value={k}>{t(`admin.finance.types.${k}`)}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={id('from')} className={LABEL}>{t('admin.finance.entries.filters.from')}</label>
          <input id={id('from')} type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} className={INPUT} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={id('to')} className={LABEL}>{t('admin.finance.entries.filters.to')}</label>
          <input id={id('to')} type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} className={INPUT} />
        </div>
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" onClick={exportCsv}><Download />{t('admin.finance.entries.export')}</Button>
          <Button variant="cta" onClick={() => setCreating(true)}><Plus />{t('admin.finance.entries.new')}</Button>
        </div>
      </div>

      {actionError && <p role="alert" className={ERROR_BOX}>{actionError}</p>}
      {list.status === 'loading' && <p className={`text-sm ${MUTED}`}>{t('common.loading')}</p>}
      {list.status === 'error' && <p className={ERROR_BOX}>{list.error}</p>}
      {list.status === 'ready' && list.items.length === 0 && (
        <p className={`${CARD} p-5 text-sm ${MUTED}`}>{t('admin.finance.entries.empty')}</p>
      )}

      {list.status === 'ready' && list.items.length > 0 && (
        <div className={TABLE_WRAP}>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={TH}>{t('admin.finance.entries.columns.date')}</th>
                <th className={TH}>{t('admin.finance.entries.columns.type')}</th>
                <th className={TH}>{t('admin.finance.entries.columns.account')}</th>
                <th className={TH}>{t('admin.finance.entries.columns.detail')}</th>
                <th className={`${TH} text-right`}>{t('admin.finance.entries.columns.amount')}</th>
                <th className={TH}>{t('admin.finance.entries.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((e) => (
                <tr key={e.id} className={TR}>
                  <td className={`${TD} whitespace-nowrap ${INK}`}>
                    {formatDate(e.effectiveAt, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className={TD}>
                    <span className={`${CHIP} ${e.direction === 'IN' ? TONE.success : TONE.neutral}`}>
                      {t(`admin.finance.types.${e.type}`)}
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {e.automatic && <span className={`${CHIP} ${TONE.info}`}>{t('admin.finance.entries.automatic')}</span>}
                      {e.isEstimate && <span className={`${CHIP} ${TONE.warning}`}>{t('admin.finance.entries.estimate')}</span>}
                      {e.reversed && <span className={`${CHIP} ${TONE.danger}`}>{t('admin.finance.entries.reversed')}</span>}
                      {e.excludeFromProfit && <span className={`${CHIP} ${TONE.neutral}`}>{t('admin.finance.entries.outOfProfit')}</span>}
                    </div>
                  </td>
                  <td className={`${TD} ${INK}`}>{accountName(e)}</td>
                  <td className={`${TD} text-xs ${MUTED} max-w-[18rem]`}>
                    {e.category?.name && <div className={INK}>{e.category.name}</div>}
                    {e.description && <div className="break-words">{e.description}</div>}
                    {e.reversesType && <div>{t('admin.finance.entries.reverses', { type: t(`admin.finance.types.${e.reversesType}`) })}</div>}
                  </td>
                  <td className={`${TD} text-right whitespace-nowrap font-semibold ${
                    e.signedAmount < 0 ? 'text-[var(--calico-danger-strong)]' : 'text-[var(--calico-green-success-dark)]'
                  }`}
                  >
                    {formatCurrency(e.signedAmount, 'COP')}
                  </td>
                  <td className={TD}>
                    <div className="flex gap-1">
                      {e.hasProof && (
                        <Button size="icon-sm" variant="ghost" aria-label={t('admin.finance.entries.viewProof')} onClick={() => openProof(e.id)}>
                          <FileText />
                        </Button>
                      )}
                      {!e.reversed && e.type !== 'REVERSAL' && (
                        <Button size="icon-sm" variant="ghost" aria-label={t('admin.finance.entries.reverse')} onClick={() => setReversing(e)}>
                          <Undo2 />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {list.status === 'ready' && list.total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <span className={`text-xs ${MUTED}`}>{t('admin.payouts.detail.page', { page: page + 1, total: totalPages })}</span>
          <div className="flex gap-1">
            <Button size="icon-sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label={t('admin.payouts.detail.previous')}><ChevronLeft /></Button>
            <Button size="icon-sm" variant="ghost" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label={t('admin.payouts.detail.next')}><ChevronRight /></Button>
          </div>
        </div>
      )}

      <EntryFormModal
        key={creating ? 'open' : 'closed'}
        open={creating}
        config={config}
        onClose={() => setCreating(false)}
        onSaved={() => { setCreating(false); setPage(0); setReload((n) => n + 1); }}
      />

      <ConfirmDialog
        open={Boolean(reversing)}
        title={t('admin.finance.entries.reverseTitle')}
        message={reversing && t('admin.finance.entries.reverseBody', {
          type: t(`admin.finance.types.${reversing.type}`),
          amount: formatCurrency(reversing.amount, 'COP'),
        })}
        confirmLabel={t('admin.finance.entries.reverse')}
        destructive
        busy={busy}
        error={dialogError}
        onConfirm={confirmReverse}
        onCancel={() => { setReversing(null); setReason(''); setDialogError(null); }}
      >
        <div className="flex flex-col gap-1 mt-3">
          <label htmlFor={id('reason')} className={LABEL}>{t('admin.finance.entryForm.reason')}</label>
          <input id={id('reason')} type="text" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={INPUT} />
          <p className={HINT}>{t('admin.finance.entries.reverseHint')}</p>
        </div>
      </ConfirmDialog>
    </div>
  );
}
