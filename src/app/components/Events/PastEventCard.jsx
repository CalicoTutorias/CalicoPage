"use client";

import Link from 'next/link';
import { ArrowRight, CheckCircle2, Star, Users } from 'lucide-react';
import { useI18n } from '../../../lib/i18n';
import { formatEventDate, joinNames } from '../../../lib/utils/event-format';
import routes from '../../../routes';
import styles from './events.module.css';

/**
 * One past event of the public history: when, which course, who taught it,
 * how many attended out of how many signed up, and its rating. The whole card
 * opens the event page, where the comments are.
 */
export default function PastEventCard({ event, attended = false }) {
  const { t, locale } = useI18n();
  const { results } = event;

  return (
    <Link href={routes.EVENT_DETAIL(event.slug)} className={styles.pastCard}>
      <div className={styles.pastCardHead}>
        <p className={styles.pastCardDate}>{formatEventDate(event.startsAt, locale)}</p>
        {attended && (
          <span className={styles.pastAttendedChip}>
            <CheckCircle2 aria-hidden="true" />
            {t('events.past.youAttended')}
          </span>
        )}
      </div>

      <h3 className={styles.pastCardTitle}>{event.title}</h3>
      <p className={styles.pastCardMeta}>
        {[event.course?.code, joinNames(event.tutors.map((tutor) => tutor.name), locale)].filter(Boolean).join(' · ')}
      </p>

      <div className={styles.pastCardStats}>
        <span className={styles.pastStat}>
          <Users aria-hidden="true" />
          {t('events.past.attendance', { attended: results.attended, registered: results.registered })}
        </span>
        <span className={styles.pastStat}>
          <Star aria-hidden="true" className={styles.pastStar} />
          <RatingText results={results} />
        </span>
      </div>

      <span className={styles.pastCardCta} aria-hidden="true">
        {t('events.past.seeResults')}
        <ArrowRight />
      </span>
    </Link>
  );
}

/** "4,6 (33 opiniones)", or why there is no average yet. */
export function RatingText({ results }) {
  const { t, locale } = useI18n();
  if (results.ratingCount === 0) return t('events.past.noRatings');
  if (results.ratingAverage == null) return t('events.past.fewRatings', { count: results.ratingCount });
  const average = results.ratingAverage.toLocaleString(locale === 'en' ? 'en-US' : 'es-CO', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return t(results.ratingCount === 1 ? 'events.past.rating_one' : 'events.past.rating_other', {
    average,
    count: results.ratingCount,
  });
}
