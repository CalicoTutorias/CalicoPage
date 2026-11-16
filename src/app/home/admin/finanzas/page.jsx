'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { Landmark } from 'lucide-react';
import { AdminFinanceService } from '@/app/services/core/AdminFinanceService';
import { useI18n } from '@/lib/i18n';
import AdminTabs, { AdminTabsFallback, useAdminTab } from '../_components/AdminTabs';
import { ERROR_BOX, INFO_BOX, INK, MUTED } from '../eventos/_components/ui';
import SummaryTab from './_components/SummaryTab';
import EntriesTab from './_components/EntriesTab';
import RefundsTab from './_components/RefundsTab';
import SettingsTab from './_components/SettingsTab';

const TABS = ['summary', 'entries', 'refunds', 'settings'];

/**
 * /home/admin/finanzas — libro de movimientos (docs/specs/finance-ledger.md):
 * cuánto dinero tiene Calico, cuánto le debe a tutores, la ganancia del
 * periodo, cada movimiento con su comprobante, devoluciones y configuración.
 */
function FinancePage() {
  const { t } = useI18n();
  const [tab, setTab] = useAdminTab(TABS, 'summary');
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState(false);

  const applyConfig = useCallback((res) => {
    if (res.success) {
      setConfig({ settings: res.settings, accounts: res.accounts, categories: res.categories, cutoffLocked: res.cutoffLocked });
      setConfigError(false);
    } else {
      setConfigError(true);
    }
  }, []);

  const loadConfig = useCallback(
    () => AdminFinanceService.getSettings().then(applyConfig),
    [applyConfig],
  );

  useEffect(() => {
    let ignore = false;
    AdminFinanceService.getSettings().then((res) => { if (!ignore) applyConfig(res); });
    return () => { ignore = true; };
  }, [applyConfig]);

  const configured = Boolean(config?.settings?.configured);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <Landmark className="w-6 h-6 mt-1 text-[var(--calico-orange)]" aria-hidden />
        <div>
          <h1 className={`text-xl font-bold ${INK}`}>{t('admin.finance.title')}</h1>
          <p className={`text-sm max-w-2xl ${MUTED}`}>{t('admin.finance.subtitle')}</p>
        </div>
      </div>

      <AdminTabs
        items={TABS.map((key) => ({ key, label: t(`admin.finance.tabs.${key}`) }))}
        active={tab}
        onChange={setTab}
        ariaLabel={t('admin.finance.title')}
      />

      {configError && <p className={ERROR_BOX}>{t('admin.finance.errors.load')}</p>}
      {config && !configured && tab !== 'settings' && (
        <p className={INFO_BOX}>{t('admin.finance.notConfigured')}</p>
      )}

      {config && configured && tab === 'summary' && <SummaryTab config={config} />}
      {config && configured && tab === 'entries' && <EntriesTab config={config} />}
      {config && tab === 'refunds' && <RefundsTab config={config} />}
      {config && tab === 'settings' && <SettingsTab config={config} onSaved={loadConfig} />}
    </div>
  );
}

export default function AdminFinancePage() {
  return (
    <Suspense fallback={<AdminTabsFallback />}>
      <FinancePage />
    </Suspense>
  );
}
