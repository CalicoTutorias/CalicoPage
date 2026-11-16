'use client';

import { useEffect, useId, useState } from 'react';
import { AdminFinanceService } from '@/app/services/core/AdminFinanceService';
import { useI18n } from '@/lib/i18n';
import { FINANCE_PROOF_ACCEPT, MAX_FINANCE_PROOF_SIZE } from '@/lib/finance/finance-proof';
import { bogotaLocalToUtc, utcToBogotaLocalInput } from '@/lib/utils/event-format';
import { HINT, INPUT, LABEL } from '../../eventos/_components/ui';

const todayInBogota = () => utcToBogotaLocalInput(new Date()).slice(0, 10);

/** Empty transfer: default account resolved once the settings load. */
export const emptyTransfer = () => ({ accountId: '', date: todayInBogota(), file: null });

/**
 * Upload the proof and build the body fields of a transfer
 * (`{ accountId, paidAt, proofS3Key }`). Resolves to `{ ok, transfer }` or
 * `{ ok: false, errorKey }` (an i18n key).
 */
export async function buildTransfer(value) {
  if (!value.date) return { ok: false, errorKey: 'admin.finance.transfer.errors.date' };
  let paidAt;
  try {
    paidAt = bogotaLocalToUtc(`${value.date}T12:00`).toISOString();
  } catch {
    return { ok: false, errorKey: 'admin.finance.transfer.errors.date' };
  }
  let proofS3Key;
  if (value.file) {
    if (value.file.size > MAX_FINANCE_PROOF_SIZE) return { ok: false, errorKey: 'admin.finance.transfer.errors.tooLarge' };
    const up = await AdminFinanceService.uploadProof(value.file);
    if (!up.success) return { ok: false, errorKey: 'admin.finance.transfer.errors.upload' };
    proofS3Key = up.s3Key;
  }
  return {
    ok: true,
    transfer: { ...(value.accountId ? { accountId: value.accountId } : {}), paidAt, ...(proofS3Key ? { proofS3Key } : {}) },
  };
}

/**
 * Account, date and proof of a transfer (to a tutor, a refund). The ledger
 * needs all three; transfers dated before its cutoff need no proof.
 *
 * Props: value = { accountId, date: 'YYYY-MM-DD', file }, onChange(next), disabled.
 */
export default function TransferFields({ value, onChange, disabled = false }) {
  const { t } = useI18n();
  const uid = useId();
  const id = (name) => `${uid}-${name}`;
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    let ignore = false;
    AdminFinanceService.getSettings().then((res) => {
      if (ignore || !res.success) return;
      const active = (res.accounts || []).filter((a) => a.isActive);
      setAccounts(active);
      if (!value.accountId && res.settings?.defaultBankAccountId) {
        onChange({ ...value, accountId: res.settings.defaultBankAccountId });
      }
    });
    return () => { ignore = true; };
    // Load once; the default account is only filled when empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key, v) => onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <label htmlFor={id('account')} className={LABEL}>{t('admin.finance.transfer.account')}</label>
          <select
            id={id('account')}
            value={value.accountId}
            onChange={(e) => set('accountId', e.target.value)}
            disabled={disabled}
            className={INPUT}
          >
            <option value="">{t('admin.finance.transfer.accountPlaceholder')}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <label htmlFor={id('date')} className={LABEL}>{t('admin.finance.transfer.date')}</label>
          <input
            id={id('date')}
            type="date"
            max={todayInBogota()}
            value={value.date}
            onChange={(e) => set('date', e.target.value)}
            disabled={disabled}
            className={INPUT}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={id('proof')} className={LABEL}>{t('admin.finance.transfer.proof')}</label>
        <input
          id={id('proof')}
          type="file"
          accept={FINANCE_PROOF_ACCEPT}
          onChange={(e) => set('file', e.target.files?.[0] ?? null)}
          disabled={disabled}
          aria-describedby={id('proof-hint')}
          className="text-sm text-[var(--calico-ink)]"
        />
        <p id={id('proof-hint')} className={HINT}>{t('admin.finance.transfer.proofHint')}</p>
      </div>
    </div>
  );
}
