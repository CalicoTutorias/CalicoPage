"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '../../../lib/i18n';
import { EventService } from '../../services/core/EventService';
import EventModal from './EventModal';
import TutorAvatar from './TutorAvatar';
import styles from './events.module.css';

const COMMENT_MAX = 1000;
const THANKS_MS = 1500;

function StarRating({ value, onChange, label }) {
  const { t } = useI18n();
  return (
    <div role="group" aria-label={label} className={styles.stars}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Button
          key={n}
          type="button"
          variant="ghost"
          size="icon"
          className={styles.starButton}
          aria-label={n === 1 ? t('events.survey.starOne') : t('events.survey.stars', { count: n })}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
        >
          <Star
            aria-hidden="true"
            className={`${styles.starIcon} ${n <= value ? styles.starFilled : ''}`.trim()}
          />
        </Button>
      ))}
    </div>
  );
}

/**
 * Post-event survey, one screen: "Did you attend?" → "No" submits right away;
 * "Yes" reveals event stars and, per tutor, stars plus an optional comment.
 * A repeat submission (SURVEY_ALREADY_SUBMITTED) counts as done.
 */
export default function EventSurveyModal({ event, onClose, onSubmitted, dismissLabel }) {
  const { t } = useI18n();
  const tutors = event?.tutors ?? [];
  const thanksId = useId();
  const commentIdPrefix = useId();

  const [attended, setAttended] = useState(false);
  const [eventRating, setEventRating] = useState(0);
  const [ratings, setRatings] = useState({});
  const [comments, setComments] = useState({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [thanks, setThanks] = useState(false);
  const thanksTimer = useRef(null);

  useEffect(() => () => clearTimeout(thanksTimer.current), []);

  // Closing the thank-you state early must not fire onSubmitted a second time
  // when the timer runs (a consumer may keep this mounted for the next item).
  const finishThanks = () => {
    clearTimeout(thanksTimer.current);
    onSubmitted();
  };

  const complete = eventRating > 0 && tutors.every((tutor) => ratings[tutor.id] > 0);

  const send = async (payload, showThanks) => {
    setSending(true);
    setError(null);
    const res = await EventService.submitSurvey(event.slug, payload);
    const done = res.success || (res.code || res.error) === 'SURVEY_ALREADY_SUBMITTED';
    if (!done) {
      setSending(false);
      setError(t('events.survey.error'));
      return;
    }
    if (!showThanks) {
      onSubmitted();
      return;
    }
    setThanks(true);
    thanksTimer.current = setTimeout(onSubmitted, THANKS_MS);
  };

  const submitAnswers = () =>
    send(
      {
        attended: true,
        eventRating,
        tutorRatings: tutors.map((tutor) => {
          const comment = (comments[tutor.id] || '').trim();
          return comment
            ? { tutorId: tutor.id, rating: ratings[tutor.id], comment }
            : { tutorId: tutor.id, rating: ratings[tutor.id] };
        }),
      },
      true,
    );

  if (thanks) {
    return (
      <EventModal onClose={finishThanks} labelledBy={thanksId}>
        <div className={styles.result} role="status">
          <span className={styles.resultIcon} aria-hidden="true"><CheckCircle2 /></span>
          <h2 id={thanksId} className={styles.resultTitle}>{t('events.survey.thanksTitle')}</h2>
          <p className={styles.resultText}>{t('events.survey.thanksText')}</p>
        </div>
      </EventModal>
    );
  }

  return (
    <EventModal title={t('events.survey.attendedQuestion', { title: event.title })} onClose={onClose}>
      <div className={styles.stack}>
        <div className={styles.choiceRow}>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className={attended ? styles.choicePressed : undefined}
            aria-pressed={attended}
            disabled={sending}
            onClick={() => setAttended(true)}
          >
            {t('events.survey.yes')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={sending}
            onClick={() => send({ attended: false }, false)}
          >
            {t('events.survey.no')}
          </Button>
        </div>

        {attended && (
          <>
            <section className={styles.surveySection}>
              <h3 className={styles.sectionHeading}>{t('events.survey.eventQuestion')}</h3>
              <StarRating
                value={eventRating}
                onChange={setEventRating}
                label={t('events.survey.eventGroup')}
              />
            </section>

            {tutors.length > 0 && (
              <section className={styles.surveySection}>
                <h3 className={styles.sectionHeading}>{t('events.survey.tutorsHeading')}</h3>
                <div className={styles.tutorList}>
                  {tutors.map((tutor) => {
                    const commentId = `${commentIdPrefix}-${tutor.id}`;
                    const comment = comments[tutor.id] || '';
                    return (
                      <div key={tutor.id} className={styles.tutorCard}>
                        <div className={styles.tutorHead}>
                          <TutorAvatar tutor={tutor} />
                          <span className={styles.tutorName}>{tutor.name}</span>
                        </div>
                        <StarRating
                          value={ratings[tutor.id] || 0}
                          onChange={(n) => setRatings((prev) => ({ ...prev, [tutor.id]: n }))}
                          label={t('events.survey.tutorGroup', { name: tutor.name })}
                        />
                        <label htmlFor={commentId} className={styles.commentLabel}>
                          {t('events.survey.commentLabel', { name: tutor.name })}
                        </label>
                        <textarea
                          id={commentId}
                          className={styles.textarea}
                          rows={2}
                          maxLength={COMMENT_MAX}
                          value={comment}
                          placeholder={t('events.survey.commentPlaceholder')}
                          onChange={(e) =>
                            setComments((prev) => ({ ...prev, [tutor.id]: e.target.value }))
                          }
                        />
                        <span className={styles.counter} aria-live="polite">
                          {t('events.survey.counter', { count: comment.length })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {error && (
          <p className={`${styles.message} ${styles.messageError}`} role="alert">
            <AlertCircle aria-hidden="true" />
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <Button type="button" variant="ghost" size="lg" onClick={onClose}>
            {dismissLabel ?? t('events.survey.close')}
          </Button>
          {attended && (
            <Button
              type="button"
              variant="cta"
              size="lg"
              disabled={!complete || sending}
              onClick={submitAnswers}
            >
              {sending && <Loader2 aria-hidden="true" className={styles.spin} />}
              {sending ? t('events.survey.sending') : t('events.survey.submit')}
            </Button>
          )}
        </div>
      </div>
    </EventModal>
  );
}
