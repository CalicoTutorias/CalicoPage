"use client";

/**
 * Public events listing: upcoming, listed, published events. Reachable
 * without login; layout mirrors /noticias (own minimal header, hero, grid).
 */

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CalendarX2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EventService } from '../services/core/EventService';
import { useAuth } from '../context/SecureAuthContext';
import { useI18n } from '../../lib/i18n';
import routes from '../../routes';
import EventCard from '../components/Events/EventCard';
import EventsHeader from './EventsHeader';
import styles from './eventos.module.css';

export default function EventosPage() {
  const { t } = useI18n();
  const { user } = useAuth();

  // status: 'loading' | 'ready' | 'error'
  const [state, setState] = useState({ status: 'loading', events: [] });

  // State is only touched in the response callback, never synchronously in
  // the effect body (react-hooks/set-state-in-effect).
  const load = useCallback(
    () => EventService.listPublic().then((res) => {
      setState(
        res.success
          ? { status: 'ready', events: res.events ?? [] }
          : { status: 'error', events: [] },
      );
    }),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const retry = () => {
    setState({ status: 'loading', events: [] });
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

        {state.status === 'loading' && (
          <div className={styles.grid} aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`${styles.skeleton} ${styles.skeletonCard}`} />
            ))}
          </div>
        )}

        {state.status === 'error' && (
          <div className={styles.empty} role="alert">
            <span className={styles.emptyIcon} aria-hidden="true"><CalendarX2 /></span>
            <p className={styles.emptyTitle}>{t('events.list.loadError')}</p>
            <Button type="button" variant="outline" onClick={retry}>
              {t('common.retry')}
            </Button>
          </div>
        )}

        {state.status === 'ready' && state.events.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true"><CalendarDays /></span>
            <p className={styles.emptyTitle}>{t('events.list.emptyTitle')}</p>
            <p className={styles.emptyText}>{t('events.list.emptyText')}</p>
          </div>
        )}

        {state.status === 'ready' && state.events.length > 0 && (
          <div className={styles.grid}>
            {state.events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
