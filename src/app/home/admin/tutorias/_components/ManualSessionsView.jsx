'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { MUTED } from '../../eventos/_components/ui';
import ManualSessionForm from './ManualSessionForm';
import ManualSessionsTable from './ManualSessionsTable';
import SessionPackagesPanel from './SessionPackagesPanel';

/**
 * Tutorías → Registrar manual (antes /home/admin/manual-sessions): registrar
 * una sesión pagada por fuera de la plataforma, los paquetes de horas y la
 * lista donde se sube el comprobante.
 */
export default function ManualSessionsView() {
  const { t } = useI18n();
  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = () => setRefreshToken((n) => n + 1);

  return (
    <div className="flex flex-col gap-5">
      <p className={`text-xs max-w-3xl leading-relaxed ${MUTED}`}>{t('admin.manualSessions.subtitle')}</p>
      <ManualSessionForm onCreated={refresh} refreshToken={refreshToken} />
      <SessionPackagesPanel refreshToken={refreshToken} onChanged={refresh} />
      <ManualSessionsTable refreshToken={refreshToken} />
    </div>
  );
}
