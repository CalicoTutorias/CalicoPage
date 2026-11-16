'use client';

import { useId, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminFinanceService } from '@/app/services/core/AdminFinanceService';
import { useI18n } from '@/lib/i18n';
import {
  CARD, CHIP, ERROR_BOX, HINT, INK, INPUT, LABEL, MUTED, SUCCESS_BOX, TABLE_WRAP, TD, TH, TONE, TR,
} from '../../eventos/_components/ui';
import EntryFormModal from './EntryFormModal';
import { dayStartIso, errorText, todayInBogota } from './format';

const ACCOUNT_TYPES = ['BANK', 'WOMPI', 'CASH'];
const toDay = (iso) => (iso ? new Date(new Date(iso).getTime() - 5 * 3_600_000).toISOString().slice(0, 10) : '');

/**
 * Ledger setup: cutoff date (locked once there are entries), 4x1000 rate,
 * default accounts, accounts and expense categories, and the opening balance.
 */
export default function SettingsTab({ config, onSaved }) {
  const { t } = useI18n();
  const uid = useId();
  const id = (n) => `${uid}-${n}`;
  const { settings, accounts, categories, cutoffLocked } = config;
  const [form, setForm] = useState(() => ({
    cutoffDate: toDay(settings.cutoffDate),
    gmfPercent: String(Math.round(settings.gmfRate * 100000) / 1000),
    wompiAccountId: settings.wompiAccountId ?? '',
    defaultBankAccountId: settings.defaultBankAccountId ?? '',
    defaultManualAccountId: settings.defaultManualAccountId ?? '',
  }));
  const [newAccount, setNewAccount] = useState({ name: '', type: 'BANK', gmfApplies: true });
  const [newCategory, setNewCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [opening, setOpening] = useState(false);

  const run = async (call) => {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await call();
    setBusy(false);
    if (!res.success) {
      setError(errorText(t, res));
      return false;
    }
    setSaved(true);
    await onSaved();
    return true;
  };

  const saveSettings = (e) => {
    e.preventDefault();
    const gmf = Number(form.gmfPercent) / 100;
    run(() => AdminFinanceService.updateSettings({
      ...(cutoffLocked ? {} : { cutoffDate: form.cutoffDate ? dayStartIso(form.cutoffDate) : null }),
      gmfRate: gmf,
      ...(form.wompiAccountId ? { wompiAccountId: form.wompiAccountId } : {}),
      ...(form.defaultBankAccountId ? { defaultBankAccountId: form.defaultBankAccountId } : {}),
      ...(form.defaultManualAccountId ? { defaultManualAccountId: form.defaultManualAccountId } : {}),
    }));
  };

  const addAccount = async (e) => {
    e.preventDefault();
    if (!newAccount.name.trim()) return;
    if (await run(() => AdminFinanceService.createAccount({ ...newAccount, name: newAccount.name.trim() }))) {
      setNewAccount({ name: '', type: 'BANK', gmfApplies: true });
    }
  };

  const addCategory = async (e) => {
    e.preventDefault();
    if (!newCategory.trim()) return;
    if (await run(() => AdminFinanceService.createCategory({ name: newCategory.trim() }))) setNewCategory('');
  };

  const accountSelect = (key, label) => (
    <div className="flex flex-col gap-1 min-w-0">
      <label htmlFor={id(key)} className={LABEL}>{label}</label>
      <select
        id={id(key)} value={form[key]} disabled={busy}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className={INPUT}
      >
        <option value="">{t('admin.finance.transfer.accountPlaceholder')}</option>
        {accounts.filter((a) => a.isActive).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {error && <p role="alert" className={ERROR_BOX}>{error}</p>}
      {saved && <p className={SUCCESS_BOX}>{t('admin.finance.settings.saved')}</p>}

      <form noValidate onSubmit={saveSettings} className={`${CARD} p-4 flex flex-col gap-3`}>
        <h2 className={`text-sm font-bold ${INK}`}>{t('admin.finance.settings.title')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <label htmlFor={id('cutoff')} className={LABEL}>{t('admin.finance.settings.cutoff')}</label>
            <input
              id={id('cutoff')} type="date" max={todayInBogota()} value={form.cutoffDate}
              disabled={busy || cutoffLocked}
              onChange={(e) => setForm((f) => ({ ...f, cutoffDate: e.target.value }))} className={INPUT}
            />
            <p className={HINT}>{t(cutoffLocked ? 'admin.finance.settings.cutoffLocked' : 'admin.finance.settings.cutoffHint')}</p>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <label htmlFor={id('gmf')} className={LABEL}>{t('admin.finance.settings.gmf')}</label>
            <input
              id={id('gmf')} type="number" min={0} max={5} step="0.001" value={form.gmfPercent} disabled={busy}
              onChange={(e) => setForm((f) => ({ ...f, gmfPercent: e.target.value }))} className={INPUT}
            />
            <p className={HINT}>{t('admin.finance.settings.gmfHint')}</p>
          </div>
          {accountSelect('wompiAccountId', t('admin.finance.settings.wompiAccount'))}
          {accountSelect('defaultBankAccountId', t('admin.finance.settings.bankAccount'))}
          {accountSelect('defaultManualAccountId', t('admin.finance.settings.manualAccount'))}
        </div>
        <Button type="submit" variant="cta" className="self-end" disabled={busy}>{t('admin.finance.settings.save')}</Button>
      </form>

      <div className={`${CARD} p-4 flex flex-col gap-2`}>
        <h2 className={`text-sm font-bold ${INK}`}>{t('admin.finance.settings.openingTitle')}</h2>
        <p className={`text-xs ${MUTED}`}>{t('admin.finance.settings.openingHint')}</p>
        <Button variant="outline" className="self-start" disabled={!settings.configured} onClick={() => setOpening(true)}>
          <Plus />{t('admin.finance.settings.openingAdd')}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className={`text-sm font-bold ${INK}`}>{t('admin.finance.settings.accountsTitle')}</h2>
        <div className={TABLE_WRAP}>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={TH}>{t('admin.finance.settings.accountName')}</th>
                <th className={TH}>{t('admin.finance.settings.accountType')}</th>
                <th className={TH}>{t('admin.finance.settings.accountGmf')}</th>
                <th className={TH}>{t('admin.finance.settings.accountActive')}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className={TR}>
                  <td className={`${TD} ${INK}`}>{a.name}</td>
                  <td className={`${TD} ${MUTED}`}>{t(`admin.finance.accountTypes.${a.type}`)}</td>
                  <td className={TD}>
                    <input
                      type="checkbox" checked={a.gmfApplies} disabled={busy}
                      aria-label={t('admin.finance.settings.accountGmf')}
                      onChange={(e) => run(() => AdminFinanceService.updateAccount(a.id, { gmfApplies: e.target.checked }))}
                      className="w-4 h-4 accent-[var(--calico-orange)]"
                    />
                  </td>
                  <td className={TD}>
                    <Button
                      size="sm" variant="ghost" disabled={busy}
                      onClick={() => run(() => AdminFinanceService.updateAccount(a.id, { isActive: !a.isActive }))}
                    >
                      <span className={`${CHIP} ${a.isActive ? TONE.success : TONE.neutral}`}>
                        {t(a.isActive ? 'admin.finance.settings.active' : 'admin.finance.settings.inactive')}
                      </span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form noValidate onSubmit={addAccount} className="flex items-end gap-2 flex-wrap">
          <div className="flex flex-col gap-1">
            <label htmlFor={id('newAccount')} className={LABEL}>{t('admin.finance.settings.accountName')}</label>
            <input
              id={id('newAccount')} type="text" maxLength={80} value={newAccount.name} disabled={busy}
              onChange={(e) => setNewAccount((n) => ({ ...n, name: e.target.value }))} className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={id('newType')} className={LABEL}>{t('admin.finance.settings.accountType')}</label>
            <select
              id={id('newType')} value={newAccount.type} disabled={busy}
              onChange={(e) => setNewAccount((n) => ({ ...n, type: e.target.value, gmfApplies: e.target.value === 'BANK' }))}
              className={INPUT}
            >
              {ACCOUNT_TYPES.map((k) => <option key={k} value={k}>{t(`admin.finance.accountTypes.${k}`)}</option>)}
            </select>
          </div>
          <label className={`flex items-center gap-2 text-sm pb-2 ${INK}`}>
            <input
              type="checkbox" checked={newAccount.gmfApplies} disabled={busy}
              onChange={(e) => setNewAccount((n) => ({ ...n, gmfApplies: e.target.checked }))}
              className="w-4 h-4 accent-[var(--calico-orange)]"
            />
            {t('admin.finance.settings.accountGmf')}
          </label>
          <Button type="submit" variant="outline" disabled={busy}><Plus />{t('admin.finance.settings.addAccount')}</Button>
        </form>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className={`text-sm font-bold ${INK}`}>{t('admin.finance.settings.categoriesTitle')}</h2>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <Button
              key={c.id} size="sm" variant="ghost" disabled={busy}
              aria-pressed={c.isActive}
              onClick={() => run(() => AdminFinanceService.updateCategory(c.id, { isActive: !c.isActive }))}
            >
              <span className={`${CHIP} ${c.isActive ? TONE.info : TONE.neutral}`}>{c.name}</span>
            </Button>
          ))}
        </div>
        <p className={HINT}>{t('admin.finance.settings.categoriesHint')}</p>
        <form noValidate onSubmit={addCategory} className="flex items-end gap-2 flex-wrap">
          <div className="flex flex-col gap-1">
            <label htmlFor={id('newCategory')} className={LABEL}>{t('admin.finance.settings.categoryName')}</label>
            <input
              id={id('newCategory')} type="text" maxLength={80} value={newCategory} disabled={busy}
              onChange={(e) => setNewCategory(e.target.value)} className={INPUT}
            />
          </div>
          <Button type="submit" variant="outline" disabled={busy}><Plus />{t('admin.finance.settings.addCategory')}</Button>
        </form>
      </div>

      {opening && (
        <EntryFormModal
          open
          config={config}
          initialKind="OPENING_BALANCE"
          onClose={() => setOpening(false)}
          onSaved={() => { setOpening(false); setSaved(true); onSaved(); }}
        />
      )}
    </div>
  );
}
