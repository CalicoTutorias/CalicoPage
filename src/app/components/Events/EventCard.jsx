"use client";

import Link from 'next/link';
import { ArrowRight, CalendarDays, Clock, MapPin, Video } from 'lucide-react';
import { useI18n } from '../../../lib/i18n';
import { formatEventDate, formatEventTimeRange } from '../../../lib/utils/event-format';
import routes from '../../../routes';
import EventPriceTag from './EventPriceTag';
import styles from './events.module.css';

/** Listing card for one public event; the whole card links to its page. */
export default function EventCard({ event }) {
  const { t, locale } = useI18n();
  const isVirtual = event.modality === 'Virtual';
  const ModalityIcon = isVirtual ? Video : MapPin;

  return (
    <Link href={routes.EVENT_DETAIL(event.slug)} className={styles.card}>
      <div className={styles.cardMedia}>
        {event.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote S3 cover; no next/image remotePatterns configured
          <img src={event.coverImageUrl} alt="" loading="lazy" />
        ) : (
          <div className={styles.coverPlaceholder} aria-hidden="true">
            <CalendarDays />
          </div>
        )}
        <span className={styles.mediaChip}>
          <ModalityIcon aria-hidden="true" />
          {t(isVirtual ? 'events.common.virtual' : 'events.common.inPerson')}
        </span>
      </div>

      <div className={styles.cardBody}>
        <p className={styles.cardDate}>{formatEventDate(event.startsAt, locale)}</p>
        <h3 className={styles.cardTitle}>{event.title}</h3>
        <p className={styles.cardMeta}>
          <Clock aria-hidden="true" />
          <span>
            {formatEventTimeRange(event.startsAt, event.endsAt, locale)} ({t('events.common.bogotaTime')})
          </span>
        </p>

        <div className={styles.cardFooter}>
          <EventPriceTag price={event.price} earlyBird={event.earlyBird} />
          <span className={styles.cardCta} aria-hidden="true">
            {t('events.list.viewEvent')}
            <ArrowRight />
          </span>
        </div>
      </div>
    </Link>
  );
}
