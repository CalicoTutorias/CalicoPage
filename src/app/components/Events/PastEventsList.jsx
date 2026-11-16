"use client";

import { useCallback, useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '../../../lib/i18n';
import { EventService } from '../../services/core/EventService';
import PastEventCard from './PastEventCard';
import styles from './events.module.css';

/**
 * The public history of events (GET /api/events/past). With `limit` it shows
 * only the first few (home); without it, pages with "see more" (/eventos).
 * `attendedIds`: events the viewer attended, to mark them.
 */
export default function PastEventsList({ limit = null, attendedIds = null }) {
  const { t } = useI18n();
  // status: 'loading' | 'ready' | 'error'
  const [state, setState] = useState({ status: 'loading', events: [], page: 1, hasMore: false, loadingMore: false });

  // State is only set in the response callbacks (react-hooks/set-state-in-effect).
  const loadPage = useCallback((page) => EventService.listPast(page).then((res) => {
    setState((current) => (res.success
      ? {
          status: 'ready',
          events: page === 1 ? res.events ?? [] : [...current.events, ...(res.events ?? [])],
          page,
          hasMore: Boolean(res.hasMore),
          loadingMore: false,
        }
      : { ...current, status: page === 1 ? 'error' : 'ready', loadingMore: false }));
  }), []);

  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  const loadMore = () => {
    setState((current) => ({ ...current, loadingMore: true }));
    loadPage(state.page + 1);
  };

  if (state.status === 'loading') {
    return (
      <div className={styles.pastGrid} aria-hidden="true">
        {Array.from({ length: limit ?? 3 }).map((_, i) => <div key={i} className={styles.pastSkeleton} />)}
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className={styles.pastEmpty} role="alert">
        <p>{t('events.past.loadError')}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => loadPage(1)}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  const events = limit ? state.events.slice(0, limit) : state.events;
  if (events.length === 0) {
    return (
      <div className={styles.pastEmpty}>
        <History aria-hidden="true" />
        <p>{t('events.past.empty')}</p>
      </div>
    );
  }

  return (
    <div className={styles.pastList}>
      <div className={styles.pastGrid}>
        {events.map((event) => (
          <PastEventCard key={event.id} event={event} attended={Boolean(attendedIds?.has(event.id))} />
        ))}
      </div>
      {!limit && state.hasMore && (
        <Button type="button" variant="outline" onClick={loadMore} disabled={state.loadingMore}>
          {state.loadingMore ? t('events.past.loadingMore') : t('events.past.loadMore')}
        </Button>
      )}
    </div>
  );
}
