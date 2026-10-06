"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/SecureAuthContext';
import { useI18n } from '../../../lib/i18n';
import { EventService } from '../../services/core/EventService';
import ReviewModal from '../ReviewModal/ReviewModal';
import EventSurveyModal from './EventSurveyModal';

const STORAGE_PREFIX = 'calico_feedback_prompt_dismissed_';

/** Today's date in the browser's local zone, `YYYY-MM-DD`. */
function localToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Student-home nudge: one pending event survey or past-session review at a
 * time. Closing without answering silences it for the rest of the local day;
 * answering shows the next pending item right away.
 */
export default function PendingFeedbackPrompt() {
  const { t } = useI18n();
  const { user } = useAuth();
  const userId = user?.isLoggedIn ? user.id || user.uid : null;
  const storageKey = `${STORAGE_PREFIX}${userId}`;
  const [item, setItem] = useState(null);
  const active = useRef(true);

  const fetchPending = useCallback(async () => {
    const res = await EventService.getPendingFeedback();
    return res?.success ? res.item ?? null : null;
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(storageKey, localToday());
    } catch {
      // Storage unavailable: the prompt may reappear on the next visit.
    }
    setItem(null);
  }, [storageKey]);

  useEffect(() => {
    active.current = true;
    if (!userId) return undefined;
    try {
      if (localStorage.getItem(storageKey) === localToday()) return undefined;
    } catch {
      // Treat unreadable storage as not dismissed.
    }
    fetchPending().then((next) => {
      if (active.current) setItem(next);
    });
    return () => {
      active.current = false;
    };
  }, [userId, storageKey, fetchPending]);

  const showNext = useCallback(async () => {
    const next = await fetchPending();
    if (active.current) setItem(next);
  }, [fetchPending]);

  // ReviewModal only reports "closed": if the same session is still pending,
  // the student walked away; otherwise the review went through.
  const handleReviewClosed = useCallback(async () => {
    const sessionId = item?.session?.id;
    const next = await fetchPending();
    if (!active.current) return;
    if (next?.type === 'session_review' && next.session?.id === sessionId) dismiss();
    else setItem(next);
  }, [item, fetchPending, dismiss]);

  if (!userId || !item) return null;

  if (item.type === 'event_survey') {
    return (
      <>
        <p className="sr-only" role="status">{t('events.prompt.title')}</p>
        <EventSurveyModal
          key={item.event.id}
          event={item.event}
          onClose={dismiss}
          onSubmitted={showNext}
          dismissLabel={t('events.prompt.notNow')}
        />
      </>
    );
  }

  if (item.type === 'session_review') {
    return (
      <ReviewModal
        key={item.session.id}
        session={item.session}
        currentUser={user}
        onClose={handleReviewClosed}
      />
    );
  }

  return null;
}
