"use client";

/**
 * The results of an event that is over, on its page: how many signed up, how
 * many attended, the survey rating, and every public comment left on its
 * tutors (same as the tutor profile shows: the student's name and picture).
 */

import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Star, UserCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '../../../lib/i18n';
import { EventService } from '../../services/core/EventService';
import { RatingText } from '../../components/Events/PastEventCard';
import styles from '../../components/Events/events.module.css';

function Stars({ rating }) {
  const { t } = useI18n();
  if (!rating) return null;
  return (
    <span className={styles.commentStars} role="img" aria-label={t('events.results.stars', { rating })}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} aria-hidden="true" className={i < rating ? styles.commentStarOn : styles.commentStarOff} />
      ))}
    </span>
  );
}

export default function EventResults({ slug }) {
  const { t, formatDate } = useI18n();
  const [state, setState] = useState({ status: 'loading', data: null, comments: [], page: 1, hasMore: false, loadingMore: false });

  const loadPage = useCallback((page) => EventService.getResults(slug, page).then((res) => {
    setState((current) => {
      if (!res.success) return { ...current, status: page === 1 ? 'error' : 'ready', loadingMore: false };
      return {
        status: 'ready',
        data: res,
        comments: page === 1 ? res.comments ?? [] : [...current.comments, ...(res.comments ?? [])],
        page,
        hasMore: Boolean(res.hasMore),
        loadingMore: false,
      };
    });
  }), [slug]);

  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  if (state.status === 'loading') return <div className={styles.pastSkeleton} aria-hidden="true" />;
  if (state.status === 'error' || !state.data?.ended || !state.data.results) return null;

  const { results, totalComments } = state.data;

  return (
    <section aria-labelledby="event-results-title" className={styles.results}>
      <h2 id="event-results-title" className={styles.resultsTitle}>{t('events.results.title')}</h2>

      <dl className={styles.resultsStats}>
        <div className={styles.resultsStat}>
          <dt><Users aria-hidden="true" />{t('events.results.registered')}</dt>
          <dd>{results.registered}</dd>
        </div>
        <div className={styles.resultsStat}>
          <dt><UserCheck aria-hidden="true" />{t('events.results.attended')}</dt>
          <dd>{results.attended}</dd>
        </div>
        <div className={styles.resultsStat}>
          <dt><Star aria-hidden="true" />{t('events.results.rating')}</dt>
          <dd className={styles.resultsRating}><RatingText results={results} /></dd>
        </div>
      </dl>
      <p className={styles.resultsNote}>{t('events.results.note')}</p>

      <h3 className={styles.commentsTitle}>
        <MessageSquare aria-hidden="true" />
        {t('events.results.commentsTitle', { count: totalComments })}
      </h3>

      {state.comments.length === 0 ? (
        <p className={styles.resultsNote}>{t('events.results.noComments')}</p>
      ) : (
        <ul className={styles.commentList}>
          {state.comments.map((comment) => (
            <li key={comment.id} className={styles.comment}>
              <div className={styles.commentHead}>
                {comment.student.profilePictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote S3 avatar; no next/image remotePatterns configured
                  <img src={comment.student.profilePictureUrl} alt="" className={styles.commentAvatar} />
                ) : (
                  <span className={styles.commentAvatarFallback} aria-hidden="true">
                    {(comment.student.name || '?').charAt(0).toUpperCase()}
                  </span>
                )}
                <div className={styles.commentWho}>
                  <span className={styles.commentName}>{comment.student.name || t('events.results.anonymous')}</span>
                  <span className={styles.commentMeta}>
                    {comment.tutor && t('events.results.aboutTutor', { tutor: comment.tutor.name })}
                    {comment.submittedAt && ` · ${formatDate(comment.submittedAt, { day: 'numeric', month: 'short', year: 'numeric' })}`}
                  </span>
                </div>
                <Stars rating={comment.rating} />
              </div>
              <p className={styles.commentText}>{comment.comment}</p>
            </li>
          ))}
        </ul>
      )}

      {state.hasMore && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={state.loadingMore}
          onClick={() => {
            setState((current) => ({ ...current, loadingMore: true }));
            loadPage(state.page + 1);
          }}
        >
          {state.loadingMore ? t('events.past.loadingMore') : t('events.results.moreComments')}
        </Button>
      )}
    </section>
  );
}
