'use client';

import { useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import UnbookedPaymentsPanel from './_components/UnbookedPaymentsPanel';
import SessionsTable from './_components/SessionsTable';
import { INK, MUTED } from '../eventos/_components/ui';

/**
 * /home/admin/tutorias — operations view of tutoring sessions: the payments
 * that took money without a booking (only when there are any) above every
 * session with its filters and CSV export. Admin-guarded by the
 * /home/admin layout and, server-side, by requireAdminUser on every call.
 */
export default function AdminSessionsPage() {
  const { t } = useI18n();
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

      <UnbookedPaymentsPanel onBooked={() => setRefreshToken((n) => n + 1)} />
      <SessionsTable refreshToken={refreshToken} />
    </div>
  );
}
