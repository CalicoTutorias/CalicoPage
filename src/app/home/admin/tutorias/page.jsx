'use client';

import { Suspense, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import UnbookedPaymentsPanel from './_components/UnbookedPaymentsPanel';
import SessionsTable from './_components/SessionsTable';
import ManualSessionsView from './_components/ManualSessionsView';
import AdminTabs, { AdminTabsFallback, useAdminTab } from '../_components/AdminTabs';
import { INK, MUTED } from '../eventos/_components/ui';

const SESSIONS_TABS = ['all', 'manual', 'unbooked'];

/**
 * /home/admin/tutorias — operación de tutorías en tres sub-pestañas:
 *   - all:      todas las sesiones con filtros y CSV
 *   - manual:   registrar una sesión pagada por fuera (ex Tutorías manuales)
 *   - unbooked: pagos que cobraron sin agendar nada (también en el Inicio)
 * Admin-guarded por el layout y, en el servidor, por requireAdminUser.
 */
function AdminSessionsView() {
  const { t } = useI18n();
  const [tab, setTab] = useAdminTab(SESSIONS_TABS, 'all');
  // Bumped when a retried payment books a session, so the table reloads.
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3 min-w-0">
        <div className="p-2 bg-[var(--calico-orange-soft)] rounded-[var(--radius-lg)] shrink-0">
          <CalendarCheck className="w-5 h-5 text-[var(--calico-orange-text)]" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className={`text-lg font-bold ${INK}`}>{t('admin.sessions.title')}</h2>
          <p className={`text-xs max-w-2xl ${MUTED}`}>{t('admin.sessions.subtitle')}</p>
        </div>
      </div>

      <AdminTabs
        ariaLabel={t('admin.sessions.title')}
        active={tab}
        onChange={setTab}
        items={SESSIONS_TABS.map((key) => ({ key, label: t(`admin.sessions.tabs.${key}`) }))}
      />

      {tab === 'all' && <SessionsTable refreshToken={refreshToken} />}
      {tab === 'manual' && <ManualSessionsView />}
      {tab === 'unbooked' && (
        <UnbookedPaymentsPanel showEmpty onBooked={() => setRefreshToken((n) => n + 1)} />
      )}
    </div>
  );
}

export default function AdminSessionsPage() {
  return (
    <Suspense fallback={<AdminTabsFallback />}>
      <AdminSessionsView />
    </Suspense>
  );
}
