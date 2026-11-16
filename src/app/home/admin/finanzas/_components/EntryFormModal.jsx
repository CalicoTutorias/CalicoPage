'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AdminFinanceService } from '@/app/services/core/AdminFinanceService';
import { useI18n } from '@/lib/i18n';
import { FINANCE_PROOF_ACCEPT } from '@/lib/finance/finance-proof';
import { PROOF_REQUIRED_KINDS } from '@/lib/finance/ledger-math';
import { bogotaLocalToUtc } from '@/lib/utils/event-format';
import { ERROR_BOX, HINT, INK, INPUT, LABEL } from '../../eventos/_components/ui';
import { errorText, todayInBogota } from './format';

const KINDS = ['EXPENSE', 'OTHER_INCOME', 'TRANSFER', 'ADJUSTMENT', 'OPENING_BALANCE'];

/**
 * New manual entry: expense, other income, transfer between accounts,
 * adjustment or opening balance. The proof is uploaded first and its key
 * sent with the entry (the server checks it).
 */
export default function EntryFormModal({ open, config, initialKind = 'EXPENSE', onClose, onSaved }) {
  const { t } = useI18n();
  const uid = useId();
  const id = (n) => `${uid}-${n}`;
  const accounts = config.accounts.filter((a) => a.isActive);
  const categories = config.categories.filter((c) => c.isActive);
  const [form, setForm] = useState(() => ({
    kind: initialKind,
    accountId: config.settings.defaultBankAccountId ?? '',
    toAccountId: '',
    amount: '',
    date: todayInBogota(),
    direction: 'OUT',
    categoryId: '',
    description: '',
    excludeFromProfit: false,
    file: null,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!open) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const proofRequired = PROOF_REQUIRED_KINDS.includes(form.kind);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const amount = Number(form.amount);
    if (!form.accountId || !Number.isFinite(amount) || amount <= 0) {
      setError(t('admin.finance.entryForm.required'));
      return;
    }
    if (proofRequired && !form.file) {
      setError(t('admin.finance.rules.PROOF_REQUIRED'));
      return;
    }
    setBusy(true);
    setError(null);

    let proofS3Key;
    if (form.file) {
      const up = await AdminFinanceService.uploadProof(form.file);
      if (!up.success) {
        setBusy(false);
        setError(errorText(t, up, 'admin.finance.transfer.errors.upload'));
        return;
      }
      proofS3Key = up.s3Key;
    }

    // A past day is stored at noon in Colombia; today is "now" (server clamps).
    const effectiveAt = form.kind === 'OPENING_BALANCE' ? undefined : bogotaLocalToUtc(`${form.date}T12:00`).toISOString();
    const res = await AdminFinanceService.createEntry({
      kind: form.kind,
      accountId: form.accountId,
      amount,
      ...(effectiveAt && form.date !== todayInBogota() ? { effectiveAt } : {}),
      ...(form.kind === 'TRANSFER' ? { toAccountId: form.toAccountId } : {}),
      ...(form.kind === 'ADJUSTMENT' ? { direction: form.direction } : {}),
      ...(form.kind === 'EXPENSE' && form.categoryId ? { categoryId: form.categoryId } : {}),
      ...(form.kind === 'OTHER_INCOME' ? { excludeFromProfit: form.excludeFromProfit } : {}),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      ...(proofS3Key ? { proofS3Key } : {}),
    });
    setBusy(false);
    if (!res.success) {
      setError(errorText(t, res));
      return;
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="presentation">
      <form
        noValidate
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id('title')}
        className="bg-white rounded-[var(--radius-xl)] p-6 w-full max-w-lg shadow-xl flex flex-col gap-3 max-h-[90vh] overflow-y-auto"
      >
        <h2 id={id('title')} className={`text-lg font-semibold ${INK}`}>{t('admin.finance.entryForm.title')}</h2>
        {error && <p role="alert" className={ERROR_BOX}>{error}</p>}

        <div className="flex flex-col gap-1">
          <label htmlFor={id('kind')} className={LABEL}>{t('admin.finance.entryForm.kind')}</label>
          <select id={id('kind')} value={form.kind} onChange={(e) => set('kind', e.target.value)} className={INPUT}>
            {KINDS.map((k) => <option key={k} value={k}>{t(`admin.finance.types.${k}`)}</option>)}
          </select>
          <p className={HINT}>{t(`admin.finance.entryForm.kindHints.${form.kind}`)}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <label htmlFor={id('account')} className={LABEL}>
              {t(form.kind === 'TRANSFER' ? 'admin.finance.entryForm.fromAccount' : 'admin.finance.entryForm.account')}
            </label>
            <select id={id('account')} value={form.accountId} onChange={(e) => set('accountId', e.target.value)} className={INPUT}>
              <option value="">{t('admin.finance.transfer.accountPlaceholder')}</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          {form.kind === 'TRANSFER' && (
            <div className="flex flex-col gap-1 min-w-0">
              <label htmlFor={id('to')} className={LABEL}>{t('admin.finance.entryForm.toAccount')}</label>
              <select id={id('to')} value={form.toAccountId} onChange={(e) => set('toAccountId', e.target.value)} className={INPUT}>
                <option value="">{t('admin.finance.transfer.accountPlaceholder')}</option>
                {accounts.filter((a) => a.id !== form.accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1 min-w-0">
            <label htmlFor={id('amount')} className={LABEL}>{t('admin.finance.entryForm.amount')}</label>
            <input
              id={id('amount')} type="number" inputMode="decimal" min={0} step="any"
              value={form.amount} onChange={(e) => set('amount', e.target.value)} className={INPUT}
            />
          </div>
          {form.kind !== 'OPENING_BALANCE' && (
            <div className="flex flex-col gap-1 min-w-0">
              <label htmlFor={id('date')} className={LABEL}>{t('admin.finance.entryForm.date')}</label>
              <input
                id={id('date')} type="date" max={todayInBogota()}
                value={form.date} onChange={(e) => set('date', e.target.value)} className={INPUT}
              />
            </div>
          )}
          {form.kind === 'ADJUSTMENT' && (
            <div className="flex flex-col gap-1 min-w-0">
              <label htmlFor={id('direction')} className={LABEL}>{t('admin.finance.entryForm.direction')}</label>
              <select id={id('direction')} value={form.direction} onChange={(e) => set('direction', e.target.value)} className={INPUT}>
                <option value="IN">{t('admin.finance.directions.IN')}</option>
                <option value="OUT">{t('admin.finance.directions.OUT')}</option>
              </select>
            </div>
          )}
          {form.kind === 'EXPENSE' && (
            <div className="flex flex-col gap-1 min-w-0">
              <label htmlFor={id('category')} className={LABEL}>{t('admin.finance.entryForm.category')}</label>
              <select id={id('category')} value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} className={INPUT}>
                <option value="">{t('admin.finance.entryForm.categoryPlaceholder')}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {form.kind === 'OTHER_INCOME' && (
          <label className={`flex items-center gap-2 text-sm ${INK}`}>
            <input
              type="checkbox" checked={form.excludeFromProfit}
              onChange={(e) => set('excludeFromProfit', e.target.checked)}
              className="w-4 h-4 accent-[var(--calico-orange)]"
            />
            {t('admin.finance.entryForm.excludeFromProfit')}
          </label>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor={id('description')} className={LABEL}>
            {t(form.kind === 'ADJUSTMENT' ? 'admin.finance.entryForm.reason' : 'admin.finance.entryForm.description')}
          </label>
          <input
            id={id('description')} type="text" maxLength={500}
            value={form.description} onChange={(e) => set('description', e.target.value)} className={INPUT}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={id('proof')} className={LABEL}>
            {t(proofRequired ? 'admin.finance.transfer.proof' : 'admin.finance.entryForm.proofOptional')}
          </label>
          <input
            id={id('proof')} type="file" accept={FINANCE_PROOF_ACCEPT}
            onChange={(e) => set('file', e.target.files?.[0] ?? null)}
            className={`text-sm ${INK}`}
          />
          <p className={HINT}>{t('admin.finance.transfer.proofHint')}</p>
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t('admin.tutorDetail.modals.common.cancel')}</Button>
          <Button type="submit" variant="cta" disabled={busy}>
            {busy ? t('admin.tutorDetail.modals.common.processing') : t('admin.finance.entryForm.submit')}
          </Button>
        </div>
      </form>
    </div>
  );
}
