'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import routes from '@/routes';
import EventForm from '../_components/EventForm';

/** New event: creates a Draft, then opens its detail page to review and publish. */
export default function AdminNewEventPage() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={routes.ADMIN_EVENTS}
        className="self-start flex items-center gap-1 text-sm font-medium text-[var(--calico-orange-text)] hover:text-[var(--calico-orange-text-hover)]"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('admin.events.backToList')}
      </Link>
      <EventForm
        onSaved={(event) => router.push(routes.ADMIN_EVENT_DETAIL(event.id))}
        onCancel={() => router.push(routes.ADMIN_EVENTS)}
      />
    </div>
  );
}
