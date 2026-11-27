'use client';

/**
 * Home (student and tutor): proposals to move a session that are waiting for
 * the user's answer. Each one opens the session detail, where it is accepted
 * or declined. Renders nothing when there are none.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import routes from '../../../routes';
import { SessionRescheduleService } from '../../services/core/SessionRescheduleService';

const WHEN = { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' };

export default function PendingRescheduleRequests({ className = '' }) {
  const { t, formatDateTime } = useI18n();
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    let active = true;
    SessionRescheduleService.listMine().then((list) => {
      if (active) setRequests(list);
    });
    return () => { active = false; };
  }, []);

  if (requests.length === 0) return null;

  return (
    <section
      aria-label={t('reschedule.home.title')}
      className={`rounded-2xl border border-[var(--calico-orange-soft)] bg-white p-4 sm:p-5 shadow-sm ${className}`}
    >
      <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-3">
        <CalendarClock className="w-4 h-4 text-[var(--calico-orange-text)]" aria-hidden="true" />
        {t('reschedule.home.title')}
      </h2>
      <ul className="space-y-2">
        {requests.map((req) => (
          <li key={req.id}>
            <Link
              href={routes.SESSION_DETAIL(req.sessionId)}
              className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 hover:border-[var(--calico-orange)] hover:bg-[var(--calico-orange-soft)] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {req.requestedByName
                    ? t('reschedule.home.item', { name: req.requestedByName, course: req.course?.name || '' })
                    : t('reschedule.home.itemNoName', { course: req.course?.name || '' })}
                </p>
                <p className="text-xs text-gray-500">
                  {t('reschedule.home.change', { from: formatDateTime(req.fromStart, WHEN), to: formatDateTime(req.toStart, WHEN) })}
                </p>
              </div>
              <span className="text-xs font-semibold text-[var(--calico-orange-text)] shrink-0">
                {t('reschedule.home.answer')}
              </span>
              <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
