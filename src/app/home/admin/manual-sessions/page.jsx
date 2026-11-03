'use client';

import { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { useI18n } from '../../../../lib/i18n';
import { INK, MUTED } from '../eventos/_components/ui';
import ManualSessionForm from './_components/ManualSessionForm';
import ManualSessionsTable from './_components/ManualSessionsTable';

export default function AdminManualSessionsPage() {
  const { t } = useI18n();
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-[var(--calico-orange-soft)] rounded-[var(--radius-lg)]">
          <CalendarPlus className="w-5 h-5 text-[var(--calico-orange-text)]" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className={`text-lg font-bold ${INK}`}>{t('admin.manualSessions.title')}</h2>
          <p className={`text-xs mt-0.5 max-w-3xl leading-relaxed ${MUTED}`}>
            {t('admin.manualSessions.subtitle')}
          </p>
        </div>
      </div>

      <ManualSessionForm onCreated={() => setRefreshToken((n) => n + 1)} />
      <ManualSessionsTable refreshToken={refreshToken} />
    </div>
  );
}
