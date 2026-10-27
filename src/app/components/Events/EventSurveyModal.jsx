"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '../../context/SecureAuthContext';
import { useI18n } from '../../../lib/i18n';
import { HEARD_FROM_DETAIL_MAX, HEARD_FROM_OPTIONS, RECOMMEND_OPTIONS } from '../../../lib/events/survey-questions';
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

/** Single-choice question: one pressed button per option. */
function ChoiceGroup({ options, value, onChange, labelFor, label, className, optionClassName, disabled }) {
  return (
    <div role="group" aria-label={label} className={className}>
      {options.map((option) => (
        <Button
          key={option}
          type="button"
          variant="outline"
          size="lg"
          className={`${optionClassName ?? ''} ${value === option ? styles.choicePressed : ''}`.trim() || undefined}
          aria-pressed={value === option}
          disabled={disabled}
          onClick={() => onChange(option)}
        >
          {labelFor(option)}
        </Button>
      ))}
    </div>
  );
}

/**
 * Post-event survey, one screen: "Did you attend?" → "How did you hear about
 * it?" (everyone; free text with "Other"); "Yes" also asks event stars,
 * "Would you recommend it?" and, per tutor, stars plus an optional comment.
 * A repeat submission (SURVEY_ALREADY_SUBMITTED) counts as done.
 */
export default function EventSurveyModal({ event, onClose, onSubmitted, dismissLabel }) {
  const { t } = useI18n();
  const { user } = useAuth();
  // Never ask the viewer to rate themselves (a tutor added after registering).
  const tutors = (event?.tutors ?? []).filter((tutor) => tutor.id !== user?.uid);
  const thanksId = useId();
  const commentIdPrefix = useId();
  const detailId = useId();

  const [attended, setAttended] = useState(null); // null until answered
  const [heardFrom, setHeardFrom] = useState('');
  const [heardFromDetail, setHeardFromDetail] = useState('');
  const [wouldRecommend, setWouldRecommend] = useState('');
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

  const complete = attended !== null && heardFrom !== '' && (
    attended === false
    || (eventRating > 0 && wouldRecommend !== '' && tutors.every((tutor) => ratings[tutor.id] > 0))
  );

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

  const submitAnswers = () => {
    const detail = heardFrom === 'other' ? heardFromDetail.trim() : '';
    const marketing = { heardFrom, ...(detail ? { heardFromDetail: detail } : {}) };
    if (!attended) {
      send({ attended: false, ...marketing }, false);
      return;
    }
    send(
      {
        attended: true,
        eventRating,
        wouldRecommend,
        ...marketing,
        tutorRatings: tutors.map((tutor) => {
          const comment = (comments[tutor.id] || '').trim();
          return comment
            ? { tutorId: tutor.id, rating: ratings[tutor.id], comment }
            : { tutorId: tutor.id, rating: ratings[tutor.id] };
        }),
      },
      true,
    );
  };

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
            className={attended === true ? styles.choicePressed : undefined}
            aria-pressed={attended === true}
            disabled={sending}
            onClick={() => setAttended(true)}
          >
            {t('events.survey.yes')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className={attended === false ? styles.choicePressed : undefined}
            aria-pressed={attended === false}
            disabled={sending}
            onClick={() => setAttended(false)}
          >
            {t('events.survey.no')}
          </Button>
        </div>

        {attended !== null && (
          <section className={styles.surveySection}>
            <h3 className={styles.sectionHeading}>{t('events.survey.heardFromQuestion', { title: event.title })}</h3>
            <ChoiceGroup
              options={HEARD_FROM_OPTIONS}
              value={heardFrom}
              onChange={setHeardFrom}
              labelFor={(option) => t(`events.survey.heardFromOptions.${option}`)}
              label={t('events.survey.heardFromGroup')}
              className={styles.choiceList}
              optionClassName={styles.choiceOption}
              disabled={sending}
            />
            {heardFrom === 'other' && (
              <>
                <label htmlFor={detailId} className={styles.commentLabel}>
                  {t('events.survey.heardFromDetailLabel')}
                </label>
                <Input
                  id={detailId}
                  type="text"
                  className={styles.input}
                  maxLength={HEARD_FROM_DETAIL_MAX}
                  value={heardFromDetail}
                  placeholder={t('events.survey.heardFromDetailPlaceholder')}
                  onChange={(e) => setHeardFromDetail(e.target.value)}
                />
              </>
            )}
          </section>
        )}

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

            <section className={styles.surveySection}>
              <h3 className={styles.sectionHeading}>{t('events.survey.recommendQuestion')}</h3>
              <ChoiceGroup
                options={RECOMMEND_OPTIONS}
                value={wouldRecommend}
                onChange={setWouldRecommend}
                labelFor={(option) => t(`events.survey.recommendOptions.${option}`)}
                label={t('events.survey.recommendQuestion')}
                className={styles.choiceRowThree}
                disabled={sending}
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
          {attended !== null && (
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
