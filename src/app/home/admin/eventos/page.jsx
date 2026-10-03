'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, EyeOff, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminEventService } from '@/app/services/core/AdminEventService';
import { useI18n } from '@/lib/i18n';
import { formatEventDate, formatEventTimeRange } from '@/lib/utils/event-format';
import routes from '@/routes';
import EventStatusBadge from './_components/EventStatusBadge';
import { CHIP, ERROR_BOX, INK, MUTED, TABLE_WRAP, TD, TH, TONE, TR, CARD, percent } from './_components/ui';

const FILTERS = ['all', 'draft', 'published', 'finished', 'canceled'];

/** Admin list of events with a status filter. A row opens the event detail. */
export default function AdminEventsPage() {
  const router = useRouter();
  const { t, formatCurrency, locale } = useI18n();
  const [filter, setFilter] = useState('all');
  const [result, setResult] = useState(null); // { filter, events } | { filter, error }

  useEffect(() => {
    let active = true;
    AdminEventService.list(filter).then((res) => {
      if (!active) return;
      setResult(res.success ? { filter, events: res.events || [] } : { filter, error: true });
    });
    return () => { active = false; };
  }, [filter]);

  const loading = !result || result.filter !== filter;
  const events = loading ? [] : result.events || [];

  const priceLabel = (e) => (e.price > 0 ? formatCurrency(e.price, 'COP') : t('admin.events.list.free'));
  const surveyLabel = (e) => (e.derivedStatus === 'finished' && e.stats ? percent(e.stats.responses, e.stats.confirmed) : '—');
  const dateLabel = (e) => (
    <>
      <span className={`block first-letter:uppercase ${INK}`}>{formatEventDate(e.startsAt, locale)}</span>
      <span className={`block text-xs ${MUTED}`}>{formatEventTimeRange(e.startsAt, e.endsAt, locale)}</span>
    </>
  );
  const registeredLabel = (e) => (
    <>
      <span className={`font-semibold ${INK}`}>{e.stats?.confirmed ?? 0}</span>
      {e.stats?.pending > 0 && (
        <span className={`block text-xs ${MUTED}`}>{t('admin.events.list.pendingCount', { count: e.stats.pending })}</span>
      )}
    </>
  );
  const hiddenChip = (e) => (!e.isListed ? (
    <span className={`${CHIP} ${TONE.neutral} gap-1`}>
      <EyeOff className="w-3 h-3" />
      {t('admin.events.list.hidden')}
    </span>
  ) : null);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 bg-[var(--calico-orange-soft)] rounded-[var(--radius-lg)] shrink-0">
            <CalendarDays className="w-5 h-5 text-[var(--calico-orange-text)]" />
          </div>
          <div className="min-w-0">
            <h2 className={`text-lg font-bold ${INK}`}>{t('admin.events.title')}</h2>
            <p className={`text-xs max-w-2xl ${MUTED}`}>{t('admin.events.subtitle')}</p>
          </div>
        </div>
        <Button asChild variant="cta" className="w-full sm:w-auto">
          <Link href={routes.ADMIN_EVENT_NEW}>
            <Plus />
            {t('admin.events.newEvent')}
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((key) => (
          <Button
            key={key}
            size="sm"
            variant={filter === key ? 'secondary' : 'outline'}
            className="rounded-full"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {t(`admin.events.filters.${key}`)}
          </Button>
        ))}
      </div>

      {!loading && result.error && <p className={ERROR_BOX}>{t('admin.events.errors.load')}</p>}

      {loading ? (
        <p className={`text-sm ${MUTED}`}>{t('common.loading')}</p>
      ) : !result.error && events.length === 0 ? (
        <div className={`flex flex-col items-center gap-2 py-12 text-center ${MUTED}`}>
          <CalendarDays className="w-8 h-8 text-[var(--calico-slate-300)]" />
          <p className="text-sm">{t('admin.events.list.empty')}</p>
        </div>
      ) : events.length > 0 && (
        <>
          {/* Mobile: one card per event */}
          <ul className="lg:hidden flex flex-col gap-3">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={routes.ADMIN_EVENT_DETAIL(e.id)} className={`${CARD} p-4 flex flex-col gap-2 hover:border-[var(--calico-orange)]`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className={`font-semibold ${INK} min-w-0`}>{e.title}</span>
                    <EventStatusBadge status={e.derivedStatus} />
                  </div>
                  <div className="text-sm">{dateLabel(e)}</div>
                  <dl className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className={MUTED}>{t('admin.events.list.columns.price')}</dt>
                      <dd className={INK}>{priceLabel(e)}</dd>
                    </div>
                    <div>
                      <dt className={MUTED}>{t('admin.events.list.columns.registered')}</dt>
                      <dd>{registeredLabel(e)}</dd>
                    </div>
                    <div>
                      <dt className={MUTED}>{t('admin.events.list.columns.survey')}</dt>
                      <dd className={INK}>{surveyLabel(e)}</dd>
                    </div>
                  </dl>
                  {hiddenChip(e) && <div>{hiddenChip(e)}</div>}
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: table, the whole row opens the detail */}
          <div className={`hidden lg:block ${TABLE_WRAP}`}>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={TH}>{t('admin.events.list.columns.title')}</th>
                  <th className={TH}>{t('admin.events.list.columns.date')}</th>
                  <th className={`${TH} text-right`}>{t('admin.events.list.columns.price')}</th>
                  <th className={TH}>{t('admin.events.list.columns.status')}</th>
                  <th className={`${TH} text-right`}>{t('admin.events.list.columns.registered')}</th>
                  <th className={`${TH} text-right`}>{t('admin.events.list.columns.survey')}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr
                    key={e.id}
                    className={`${TR} cursor-pointer hover:bg-[var(--calico-slate-50)]`}
                    onClick={() => router.push(routes.ADMIN_EVENT_DETAIL(e.id))}
                  >
                    <td className={TD}>
                      <Link
                        href={routes.ADMIN_EVENT_DETAIL(e.id)}
                        onClick={(ev) => ev.stopPropagation()}
                        className={`font-semibold ${INK} hover:underline`}
                      >
                        {e.title}
                      </Link>
                      {hiddenChip(e) && <div className="mt-1">{hiddenChip(e)}</div>}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>{dateLabel(e)}</td>
                    <td className={`${TD} text-right whitespace-nowrap ${INK}`}>{priceLabel(e)}</td>
                    <td className={TD}><EventStatusBadge status={e.derivedStatus} /></td>
                    <td className={`${TD} text-right whitespace-nowrap`}>{registeredLabel(e)}</td>
                    <td className={`${TD} text-right whitespace-nowrap ${INK}`}>{surveyLabel(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
