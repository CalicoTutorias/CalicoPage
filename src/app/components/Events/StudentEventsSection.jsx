"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '../../../lib/i18n';
import { formatEventDate, formatEventTime } from '../../../lib/utils/event-format';
import routes from '../../../routes';
import { EventService } from '../../services/core/EventService';
import EventCard from './EventCard';
import PastEventsList from './PastEventsList';
import styles from './events.module.css';

const JOIN_WINDOW_MS = 15 * 60 * 1000;
const SUGGESTIONS_MAX = 3;
const PAST_MAX = 3;
const TABS = ['upcoming', 'past'];

/**
 * Student home, one "Events" block (review sessions are events too) with two tabs:
 *  - Upcoming: the student's confirmed (or pending-approval) events, plus up to 3 suggestions;
 *  - Past: the latest events that took place, with attendance and rating, the
 *    ones the student attended marked. The comments are on each event page.
 */
export default function StudentEventsSection() {
  const { t, locale } = useI18n();
  const [upcoming, setUpcoming] = useState([]);
  const [suggested, setSuggested] = useState([]);
  const [attendedIds, setAttendedIds] = useState(() => new Set());
  const [loadedAt, setLoadedAt] = useState(0);
  const [tab, setTab] = useState(null); // chosen once loaded

  useEffect(() => {
    let active = true;
    Promise.all([EventService.getMyEvents(), EventService.listPublic()]).then(([mine, pub]) => {
      if (!active) return;
      const now = Date.now();
      setLoadedAt(now);
      const registrations = mine?.success ? mine.registrations ?? [] : [];
      const mineIds = new Set(registrations.map((r) => r.event?.id));
      setAttendedIds(new Set(registrations.filter((r) => r.attended).map((r) => r.event?.id)));
      setUpcoming(
        registrations
          .filter(
            (r) =>
              (r.status === 'Confirmed' || r.status === 'PendingApproval') &&
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

  if (!loadedAt) return null;
  const hasUpcoming = upcoming.length > 0 || suggested.length > 0;
  const activeTab = tab ?? (hasUpcoming ? 'upcoming' : 'past');

  return (
    <section className={styles.homeSection} aria-labelledby="home-events-title">
      <div className={styles.homeTabsHead}>
        <h2 id="home-events-title" className={styles.homeHeading}>{t('events.home.title')}</h2>
        <div role="tablist" aria-labelledby="home-events-title" className={styles.homeTabs}>
          {TABS.map((name) => (
            <Button
              key={name}
              type="button"
              role="tab"
              size="sm"
              variant={activeTab === name ? 'cta' : 'outline'}
              aria-selected={activeTab === name}
              onClick={() => setTab(name)}
            >
              {t(`events.tabs.${name}`)}
            </Button>
          ))}
        </div>
      </div>

      {activeTab === 'past' && (
        <>
          <PastEventsList limit={PAST_MAX} attendedIds={attendedIds} />
          <Link href={routes.EVENTS_PAST} className={styles.homeViewAll}>
            {t('events.home.viewAllPast')}
            <ArrowRight aria-hidden="true" />
          </Link>
        </>
      )}

      {activeTab === 'upcoming' && !hasUpcoming && (
        <p className={styles.homeItemMeta}>{t('events.home.noUpcoming')}</p>
      )}

      {activeTab === 'upcoming' && upcoming.length > 0 && (
        <div className={styles.homeBlock}>
          <h3 className={styles.homeSubheading}>{t('events.home.upcomingTitle')}</h3>
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
                      {formatEventTime(r.event, locale, t)} ({t('events.common.bogotaTime')})
                    </p>
                    {r.status === 'PendingApproval' && (
                      <p className={styles.homeItemMeta}>{t('events.home.pendingApproval')}</p>
                    )}
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

      {activeTab === 'upcoming' && suggested.length > 0 && (
        <div className={styles.homeBlock}>
          <h3 className={styles.homeSubheading}>{t('events.home.suggestedTitle')}</h3>
          <div className={styles.homeGrid}>
            {suggested.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </div>
      )}

      {activeTab === 'upcoming' && (
        <Link href={routes.EVENTS} className={styles.homeViewAll}>
          {t('events.home.viewAll')}
          <ArrowRight aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
