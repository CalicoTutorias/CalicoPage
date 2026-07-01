'use client';

import { useEffect, useState } from 'react';
import { Bell, Check, Loader2 } from 'lucide-react';
import CourseNotifyService from '../../services/integrations/CourseNotifyService';
import './NotifyMeButton.css';

export default function NotifyMeButton({ courseId, source = 'unknown', className = '', onCourseAvailable }) {
  const [state, setState] = useState('idle');

  useEffect(() => {
    let alive = true;
    if (!courseId) return undefined;

    CourseNotifyService.getState(courseId).then((data) => {
      if (!alive || !data) return;
      if (data.availableTutorCount > 0) {
        setState('hidden');
        onCourseAvailable?.(data.availableTutorCount);
      } else if (data.subscribed) {
        setState('subscribed');
      }
    });

    return () => {
      alive = false;
    };
  }, [courseId, onCourseAvailable]);

  if (!courseId || state === 'hidden') return null;

  const subscribe = async (event) => {
    event.stopPropagation();
    if (state === 'loading' || state === 'subscribed' || state === 'success') return;

    setState('loading');
    const result = await CourseNotifyService.subscribe(courseId, source);

    if (result.status === 401) {
      setState('idle');
      window.location.href = '/auth/login';
      return;
    }

    const nextState = result.data?.state;
    if (result.ok && nextState === 'created') {
      setState('success');
      return;
    }
    if (result.ok && nextState === 'already_subscribed') {
      setState('subscribed');
      return;
    }
    if (result.ok && nextState === 'course_available') {
      setState('hidden');
      onCourseAvailable?.(result.data?.availableTutorCount ?? 1);
      return;
    }

    setState('error');
  };

  const content = {
    idle: (
      <>
        <Bell size={16} aria-hidden />
        <span>Notify Me</span>
      </>
    ),
    loading: (
      <>
        <Loader2 size={16} aria-hidden className="notify-me-button__spinner" />
        <span>Loading</span>
      </>
    ),
    success: (
      <>
        <Check size={16} aria-hidden />
        <span>Success</span>
      </>
    ),
    subscribed: (
      <>
        <Check size={16} aria-hidden />
        <span>Already subscribed</span>
      </>
    ),
    error: (
      <>
        <Bell size={16} aria-hidden />
        <span>Try again</span>
      </>
    ),
  };

  return (
    <button
      type="button"
      className={`notify-me-button notify-me-button--${state} ${className}`}
      onClick={subscribe}
      disabled={state === 'loading' || state === 'success' || state === 'subscribed'}
    >
      {content[state] || content.idle}
    </button>
  );
}
