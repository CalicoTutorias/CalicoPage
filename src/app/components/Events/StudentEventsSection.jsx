"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '../../../lib/i18n';
import { formatEventDate, formatEventTimeRange } from '../../../lib/utils/event-format';
import routes from '../../../routes';
import { EventService } from '../../services/core/EventService';
import EventCard from './EventCard';
import styles from './events.module.css';

const JOIN_WINDOW_MS = 15 * 60 * 1000;
const SUGGESTIONS_MAX = 3;

/** Student home: confirmed upcoming events plus up to 3 suggestions. */
export default function StudentEventsSection() {
  const { t, locale } = useI18n();
  const [upcoming, setUpcoming] = useState([]);
  const [suggested, setSuggested] = useState([]);
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([EventService.getMyEvents(), EventService.listPublic()]).then(([mine, pub]) => {
      if (!active) return;
      const now = Date.now();
      setLoadedAt(now);
      const registrations = mine?.success ? mine.registrations ?? [] : [];
      const mineIds = new Set(registrations.map((r) => r.event?.id));
      setUpcoming(
        registrations
          .filter(
            (r) =>
              r.status === 'Confirmed' &&
              r.event?.status !== 'Canceled' &&
              new Date(r.event.endsAt).getTime() > now,
          )
          .sort((a, b) => new Date(a.event.startsAt) - new Date(b.event.startsAt)),
      );
      // Only events the student can still sign up for (not started yet).
      setSuggested(
        (pub?.success ? pub.events ?? [] : [])
          .filter((e) => e.registrationOpen && !mineIds.has(e.id))
          .slice(0, SUGGESTIONS_MAX),
      );
    });
    return () => {
      active = false;
    };
  }, []);

  if (upcoming.length === 0 && suggested.length === 0) return null;

  return (
    <section className={styles.homeSection} aria-label={t('events.home.upcomingTitle')}>
      {upcoming.length > 0 && (
        <div className={styles.homeBlock}>
          <h2 className={styles.homeHeading}>{t('events.home.upcomingTitle')}</h2>
          <ul className={styles.homeList}>
            {upcoming.map((r) => {
              const start = new Date(r.event.startsAt).getTime();
              const canJoin = r.meetingUrl && start - loadedAt < JOIN_WINDOW_MS;
              return (
                <li key={r.id} className={styles.homeItem}>
                  <CalendarCheck aria-hidden="true" className={styles.homeItemIcon} />
                  <div className={styles.homeItemText}>
                    <p className={styles.homeItemTitle}>{r.event.title}</p>
                    <p className={styles.homeItemMeta}>
                      {formatEventDate(r.event.startsAt, locale)} ·{' '}
                      {formatEventTimeRange(r.event.startsAt, r.event.endsAt, locale)} ({t('events.common.bogotaTime')})
                    </p>
                  </div>
                  {canJoin ? (
                    <Button asChild size="sm">
                      <a href={r.meetingUrl} target="_blank" rel="noopener noreferrer">
                        {t('events.home.join')}
                      </a>
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="outline">
                      <Link href={routes.EVENT_DETAIL(r.event.slug)}>{t('events.home.viewEvent')}</Link>
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {suggested.length > 0 && (
        <div className={styles.homeBlock}>
          <h2 className={styles.homeHeading}>{t('events.home.suggestedTitle')}</h2>
          <div className={styles.homeGrid}>
            {suggested.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </div>
      )}

      <Link href={routes.EVENTS} className={styles.homeViewAll}>
        {t('events.home.viewAll')}
        <ArrowRight aria-hidden="true" />
      </Link>
    </section>
  );
}
