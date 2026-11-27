'use client';

/**
 * Student home: invitations to group tutoring sessions still waiting for an
 * answer (sent to the user's own emails). Each one opens its invitation page,
 * where it is accepted or declined. Renders nothing when there are none.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Users } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import routes from '../../../routes';
import { SessionInvitationService } from '../../services/core/SessionInvitationService';

export default function PendingInvitations({ className = '' }) {
  const { t, formatDateTime } = useI18n();
  const [invitations, setInvitations] = useState([]);

  useEffect(() => {
    let active = true;
    SessionInvitationService.listMine().then((list) => {
      if (active) setInvitations(list);
    });
    return () => { active = false; };
  }, []);

  if (invitations.length === 0) return null;

  return (
    <section
      aria-label={t('invitation.home.title')}
      className={`rounded-2xl border border-[var(--calico-orange-soft)] bg-white p-4 sm:p-5 shadow-sm ${className}`}
    >
      <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-[var(--calico-orange-text)]" aria-hidden="true" />
        {t('invitation.home.title')}
      </h2>
      <ul className="space-y-2">
        {invitations.map((inv) => (
          <li key={inv.id}>
            <Link
              href={routes.INVITATION(inv.id)}
              className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 hover:border-[var(--calico-orange)] hover:bg-[var(--calico-orange-soft)] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {inv.inviterName
                    ? t('invitation.home.item', { name: inv.inviterName, course: inv.course?.name || '' })
                    : t('invitation.home.itemNoName', { course: inv.course?.name || '' })}
                </p>
                <p className="text-xs text-gray-500">
                  {formatDateTime(inv.startTimestamp)}
                  {inv.tutor?.name ? ` · ${inv.tutor.name}` : ''}
                </p>
              </div>
              <span className="text-xs font-semibold text-[var(--calico-orange-text)] shrink-0">
                {t('invitation.home.answer')}
              </span>
              <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
