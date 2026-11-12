"use client";

/**
 * Public events listing: upcoming, listed, published events, and a "Past"
 * tab with the history of events that took place (attendance and rating;
 * the comments are on each event page). Reachable without login; layout
 * mirrors /noticias (own minimal header, hero, grid). Also served at /repasos
 * (the poster URL). A ?ref=<source> on the listing is passed on to every card,
 * so the registration still records it; ?tab=pasados opens the history.
 */

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CalendarX2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EventService } from '../services/core/EventService';
import { useAuth } from '../context/SecureAuthContext';
import { useI18n } from '../../lib/i18n';
import routes from '../../routes';
import EventCard from '../components/Events/EventCard';
import PastEventsList from '../components/Events/PastEventsList';
import EventsHeader from './EventsHeader';
import styles from './eventos.module.css';

const SOURCE_RE = /^[a-z0-9_-]{1,40}$/;
const TABS = ['upcoming', 'past'];
/** routes.EVENTS_PAST ends in ?tab=pasados. */
const PAST_TAB_PARAM = 'pasados';

/** ?ref= of the current URL when valid (read in a callback: no useSearchParams Suspense boundary needed). */
function currentSource() {
  const ref = (new URLSearchParams(window.location.search).get('ref') || '').toLowerCase();
  return SOURCE_RE.test(ref) ? ref : undefined;
}

/** ?tab=pasados opens the history (links from the home "see all"). */
function initialTab() {
  return new URLSearchParams(window.location.search).get('tab') === PAST_TAB_PARAM ? 'past' : 'upcoming';
}

export default function EventosPage() {
  const { t } = useI18n();
  const { user } = useAuth();

  // status: 'loading' | 'ready' | 'error'
  const [state, setState] = useState({ status: 'loading', events: [], source: undefined });
  const [tab, setTab] = useState('upcoming');

  // State is only touched in the response callback, never synchronously in
  // the effect body (react-hooks/set-state-in-effect).
  const load = useCallback(
    () => EventService.listPublic().then((res) => {
      setTab(initialTab());
      setState(
        res.success
          ? { status: 'ready', events: res.events ?? [], source: currentSource() }
          : { status: 'error', events: [], source: undefined },
      );
    }),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const retry = () => {
    setState({ status: 'loading', events: [], source: undefined });
    load();
  };

  const backHref = user?.isLoggedIn ? routes.HOME : routes.LANDING;
  const backLabel = user?.isLoggedIn ? t('events.list.backToHome') : t('events.list.backToLanding');

  return (
    <div className={styles.container}>
      <EventsHeader backHref={backHref} backLabel={backLabel} />

      <main className={styles.main}>
        <div className={styles.hero}>
          <span className={styles.heroIcon} aria-hidden="true">
            <CalendarDays />
          </span>
          <h1 className={styles.title}>{t('events.list.pageTitle')}</h1>
          <p className={styles.subtitle}>{t('events.list.pageSubtitle')}</p>
        </div>

        <div role="tablist" aria-label={t('events.tabs.label')} className={styles.tabs}>
          {TABS.map((name) => (
            <Button
              key={name}
              type="button"
              role="tab"
              variant={tab === name ? 'cta' : 'outline'}
              aria-selected={tab === name}
              onClick={() => setTab(name)}
            >
              {t(`events.tabs.${name}`)}
            </Button>
          ))}
        </div>

        {tab === 'past' && <PastEventsList />}

        {tab === 'upcoming' && state.status === 'loading' && (
          <div className={styles.grid} aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`${styles.skeleton} ${styles.skeletonCard}`} />
            ))}
          </div>
        )}

        {tab === 'upcoming' && state.status === 'error' && (
          <div className={styles.empty} role="alert">
            <span className={styles.emptyIcon} aria-hidden="true"><CalendarX2 /></span>
            <p className={styles.emptyTitle}>{t('events.list.loadError')}</p>
            <Button type="button" variant="outline" onClick={retry}>
              {t('common.retry')}
            </Button>
          </div>
        )}

        {tab === 'upcoming' && state.status === 'ready' && state.events.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true"><CalendarDays /></span>
            <p className={styles.emptyTitle}>{t('events.list.emptyTitle')}</p>
            <p className={styles.emptyText}>{t('events.list.emptyText')}</p>
          </div>
        )}

        {tab === 'upcoming' && state.status === 'ready' && state.events.length > 0 && (
          <div className={styles.grid}>
            {state.events.map((event) => (
              <EventCard key={event.id} event={event} source={state.source} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
