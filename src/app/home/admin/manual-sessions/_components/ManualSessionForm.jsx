'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { computeSessionAmount } from '@/lib/payments/session-amount';
import { createCourseSearcher } from '@/app/services/utils/CourseSearch';
import { AdminService } from '../../../../services/core/AdminService';
import { UserService } from '../../../../services/core/UserService';
import { useI18n } from '../../../../../lib/i18n';
import { ERROR_BOX, HINT, INFO_BOX, INPUT, LABEL, MUTED, CARD, SUCCESS_BOX } from '../../eventos/_components/ui';
import { errorKey } from './errors';

const COURSE_RESULTS_LIMIT = 8;
const OPTION_BUTTON = 'w-full h-auto justify-start rounded-none px-3 py-2 font-normal text-[var(--calico-ink)] hover:bg-[var(--calico-slate-50)] hover:text-[var(--calico-ink)]';

/** A panel's async state: 'idle' until there is something to load. */
const IDLE = { status: 'idle', items: [] };
const LOADING = { status: 'loading', items: [] };

/**
 * Form to register a manual session. Each answer unlocks the next one: the
 * course decides the tutors, the tutor decides the dates, the date decides the
 * start times and the start decides which durations fit. The amount is never
 * typed: it follows from the course price and the duration.
 */
export default function ManualSessionForm({ onCreated }) {
  const { t, formatCurrency, formatDate } = useI18n();
  const formId = useId();
  const id = (name) => `${formId}-${name}`;

  const [courses, setCourses] = useState(LOADING);
  const [coursesReload, setCoursesReload] = useState(0);
  const [courseQuery, setCourseQuery] = useState('');
  const [course, setCourse] = useState(null);

  const [tutors, setTutors] = useState(IDLE);
  const [tutorsReload, setTutorsReload] = useState(0);
  const [tutorId, setTutorId] = useState('');

  const [availability, setAvailability] = useState(IDLE);
  const [availabilityReload, setAvailabilityReload] = useState(0);
  const [timeZone, setTimeZone] = useState(null);
  const [date, setDate] = useState('');
  const [startTimestamp, setStartTimestamp] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(null);

  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  useEffect(() => {
    let active = true;
    UserService.getAllCourses()
      .then((res) => {
        if (!active) return;
        setCourses(res?.success ? { status: 'ready', items: res.courses } : { status: 'error', items: [] });
      })
      .catch(() => {
        if (active) setCourses({ status: 'error', items: [] });
      });
    return () => { active = false; };
  }, [coursesReload]);

  const courseId = course?.id ?? null;
  useEffect(() => {
    if (!courseId) return undefined;
    let active = true;
    AdminService.listManualSessionTutors(courseId)
      .then((res) => {
        if (!active) return;
        setTutors(res?.success ? { status: 'ready', items: res.tutors } : { status: 'error', items: [], res });
      })
      .catch(() => {
        if (active) setTutors({ status: 'error', items: [] });
      });
    return () => { active = false; };
  }, [courseId, tutorsReload]);

  useEffect(() => {
    if (!tutorId) return undefined;
    let active = true;
    AdminService.getManualSessionAvailability(tutorId)
      .then((res) => {
        if (!active) return;
        if (res?.success) {
          setTimeZone(res.timeZone);
          setAvailability({ status: 'ready', items: res.days });
        } else {
          setAvailability({ status: 'error', items: [], res });
        }
      })
      .catch(() => {
        if (active) setAvailability({ status: 'error', items: [] });
      });
    return () => { active = false; };
  }, [tutorId, availabilityReload]);

  const courseSearcher = useMemo(() => createCourseSearcher(courses.items), [courses.items]);
  const courseMatches = courseQuery.trim() ? courseSearcher.search(courseQuery).slice(0, COURSE_RESULTS_LIMIT) : [];

  // Derived, not stored: a reload that takes the chosen slot away empties these on its own.
  const day = availability.items.find((d) => d.date === date) ?? null;
  const slot = day?.slots.find((s) => s.startTimestamp === startTimestamp) ?? null;
  const duration = slot?.durations.includes(durationMinutes) ? durationMinutes : slot?.durations[0] ?? null;

  const hasPrice = !course || Number(course.basePrice) > 0;
  const amount = course && slot && duration && hasPrice
    ? computeSessionAmount({
      course,
      startTimestamp: slot.startTimestamp,
      endTimestamp: new Date(new Date(slot.startTimestamp).getTime() + duration * 60_000),
    })
    : null;

  const clearSchedule = () => {
    setDate('');
    setStartTimestamp('');
    setDurationMinutes(null);
  };

  const chooseCourse = (next) => {
    setCourse(next);
    setCourseQuery('');
    setTutors(next ? LOADING : IDLE);
    setTutorId('');
    setAvailability(IDLE);
    clearSchedule();
  };

  const chooseTutor = (nextTutorId) => {
    setTutorId(nextTutorId);
    setAvailability(nextTutorId ? LOADING : IDLE);
    clearSchedule();
  };

  const reloadAvailability = () => {
    setAvailability(LOADING);
    setAvailabilityReload((n) => n + 1);
  };

  const dayLabel = (isoDate) => formatDate(new Date(`${isoDate}T12:00:00Z`), {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });

  const canSubmit = Boolean(course && tutorId && slot && duration && hasPrice && phone.trim() && email.trim());

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    setCreated(null);

    const sentTo = email.trim().toLowerCase();
    try {
      const res = await AdminService.createManualSession({
        tutorId,
        courseId: course.id,
        student: { phoneNumber: phone.trim(), email: sentTo },
        startTimestamp: slot.startTimestamp,
        durationMinutes: duration,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      if (!res.success) {
        setError(t(errorKey(res, 'admin.manualSessions.errors.create')));
        // Somebody took the slot meanwhile: show what is left instead of the stale list.
        if (res.error === 'SLOT_NOT_AVAILABLE' || res.error === 'SESSION_CONFLICT') reloadAvailability();
        return;
      }
      setCreated({ ...res, sentTo });
      chooseCourse(null);
      setPhone('');
      setEmail('');
      setNotes('');
      onCreated?.();
    } catch {
      setError(t('admin.manualSessions.errors.create'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className={`${CARD} p-5 grid grid-cols-1 md:grid-cols-2 gap-4`}>
        <div className="flex flex-col gap-1 min-w-0 md:col-span-2">
          <label htmlFor={id('course')} className={LABEL}>{t('admin.manualSessions.fields.course')}</label>
          {course ? (
            <div className="flex items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-[var(--calico-slate-200)] px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-[var(--calico-ink)]">
                {course.code ? `${course.code} · ` : ''}{course.name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('admin.manualSessions.course.clear')}
                onClick={() => chooseCourse(null)}
              >
                <X />
              </Button>
            </div>
          ) : (
            <>
              <input
                id={id('course')}
                type="search"
                value={courseQuery}
                onChange={(e) => setCourseQuery(e.target.value)}
                placeholder={t('admin.manualSessions.course.searchPlaceholder')}
                disabled={courses.status === 'loading'}
                className={INPUT}
                autoComplete="off"
              />
              {courses.status === 'error' && (
                <div className={`${ERROR_BOX} flex items-center justify-between gap-2 flex-wrap`}>
                  {t('admin.manualSessions.errors.loadCourses')}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCourses(LOADING);
                      setCoursesReload((n) => n + 1);
                    }}
                  >
                    {t('admin.manualSessions.retry')}
                  </Button>
                </div>
              )}
              {courseQuery.trim() && (
                <ul className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--calico-slate-200)] divide-y divide-[var(--calico-slate-100)] max-h-56 overflow-y-auto">
                  {courseMatches.length === 0 && (
                    <li className={`px-3 py-2 text-sm ${MUTED}`}>{t('admin.manualSessions.course.noResults')}</li>
                  )}
                  {courseMatches.map((c) => (
                    <li key={c.id}>
                      <Button
                        type="button"
                        variant="ghost"
                        className={OPTION_BUTTON}
                        aria-label={t('admin.manualSessions.course.select', { name: c.name })}
                        onClick={() => chooseCourse(c)}
                      >
                        <span className="font-mono text-xs">{c.code}</span>
                        <span className="min-w-0 truncate">{c.name}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {!hasPrice && <p className={ERROR_BOX}>{t('admin.manualSessions.errors.NO_PRICE')}</p>}
        </div>

        <div className="flex flex-col gap-1 min-w-0 md:col-span-2">
          <label htmlFor={id('tutor')} className={LABEL}>{t('admin.manualSessions.fields.tutor')}</label>
          <select
            id={id('tutor')}
            required
            value={tutorId}
            onChange={(e) => chooseTutor(e.target.value)}
            disabled={tutors.status !== 'ready' || tutors.items.length === 0}
            className={INPUT}
          >
            <option value="">
              {tutors.status === 'idle' && t('admin.manualSessions.placeholders.tutorNeedsCourse')}
              {tutors.status === 'loading' && t('common.loading')}
              {tutors.status === 'ready' && t('admin.manualSessions.placeholders.tutor')}
              {tutors.status === 'error' && '—'}
            </option>
            {tutors.items.map((tutor) => (
              <option key={tutor.id} value={tutor.id}>{tutor.name}</option>
            ))}
          </select>
          {tutors.status === 'ready' && tutors.items.length === 0 && (
            <p className={INFO_BOX}>{t('admin.manualSessions.course.noTutors')}</p>
          )}
          {tutors.status === 'error' && (
            <div className={`${ERROR_BOX} flex items-center justify-between gap-2 flex-wrap`}>
              {t(errorKey(tutors.res, 'admin.manualSessions.errors.loadTutors'))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setTutors(LOADING);
                  setTutorsReload((n) => n + 1);
                }}
              >
                {t('admin.manualSessions.retry')}
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1 min-w-0">
          <label htmlFor={id('phone')} className={LABEL}>{t('admin.manualSessions.fields.studentPhone')}</label>
          <input
            id={id('phone')}
            required
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+57 300 123 4567"
            autoComplete="off"
            className={INPUT}
          />
        </div>

        <div className="flex flex-col gap-1 min-w-0">
          <label htmlFor={id('email')} className={LABEL}>{t('admin.manualSessions.fields.studentEmail')}</label>
          <input
            id={id('email')}
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby={id('email-hint')}
            autoComplete="off"
            className={INPUT}
          />
          <p id={id('email-hint')} className={HINT}>{t('admin.manualSessions.hints.studentEmail')}</p>
        </div>

        <div className="flex flex-col gap-1 min-w-0 md:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1 min-w-0">
              <label htmlFor={id('date')} className={LABEL}>{t('admin.manualSessions.fields.date')}</label>
              <select
                id={id('date')}
                required
                value={day?.date ?? ''}
                onChange={(e) => {
                  setDate(e.target.value);
                  setStartTimestamp('');
                }}
                disabled={availability.items.length === 0}
                className={INPUT}
              >
                <option value="">
                  {availability.status === 'loading'
                    ? t('common.loading')
                    : t(tutorId ? 'admin.manualSessions.placeholders.date' : 'admin.manualSessions.placeholders.dateNeedsTutor')}
                </option>
                {availability.items.map((d) => (
                  <option key={d.date} value={d.date}>{dayLabel(d.date)}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1 min-w-0">
              <label htmlFor={id('start')} className={LABEL}>{t('admin.manualSessions.fields.startTime')}</label>
              <select
                id={id('start')}
                required
                value={slot?.startTimestamp ?? ''}
                onChange={(e) => setStartTimestamp(e.target.value)}
                disabled={!day}
                className={INPUT}
              >
                <option value="">
                  {t(day ? 'admin.manualSessions.placeholders.startTime' : 'admin.manualSessions.placeholders.startTimeNeedsDate')}
                </option>
                {day?.slots.map((s) => (
                  <option key={s.startTimestamp} value={s.startTimestamp}>{s.time}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1 min-w-0">
              <label htmlFor={id('duration')} className={LABEL}>{t('admin.manualSessions.fields.duration')}</label>
              <select
                id={id('duration')}
                required
                value={duration ?? ''}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                disabled={!slot}
                className={INPUT}
              >
                {!slot && <option value="">{t('admin.manualSessions.placeholders.durationNeedsStart')}</option>}
                {slot?.durations.map((minutes) => (
                  <option key={minutes} value={minutes}>{t('admin.manualSessions.durationOption', { minutes })}</option>
                ))}
              </select>
            </div>
          </div>
          {availability.status === 'ready' && availability.items.length === 0 && (
            <p className={INFO_BOX}>{t('admin.manualSessions.noAvailability')}</p>
          )}
          {availability.status === 'ready' && availability.items.length > 0 && timeZone && (
            <p className={HINT}>{t('admin.manualSessions.hints.timeZone', { timeZone })}</p>
          )}
          {availability.status === 'error' && (
            <div className={`${ERROR_BOX} flex items-center justify-between gap-2 flex-wrap`}>
              {t(errorKey(availability.res, 'admin.manualSessions.errors.loadAvailability'))}
              <Button type="button" variant="outline" size="sm" onClick={reloadAvailability}>
                {t('admin.manualSessions.retry')}
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1 min-w-0 md:col-span-2">
          <span className={LABEL}>{t('admin.manualSessions.fields.amount')}</span>
          <p className="text-sm font-semibold text-[var(--calico-ink)]" aria-live="polite">
            {amount === null ? '—' : formatCurrency(amount, 'COP')}
          </p>
          <p className={HINT}>{t('admin.manualSessions.hints.amount')}</p>
        </div>

        <div className="flex flex-col gap-1 min-w-0 md:col-span-2">
          <label htmlFor={id('notes')} className={LABEL}>{t('admin.manualSessions.fields.notes')}</label>
          <textarea
            id={id('notes')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={1000}
            className={INPUT}
          />
        </div>

        <div className="md:col-span-2 flex items-center justify-between gap-3 flex-wrap">
          <p className={HINT}>{t('admin.manualSessions.hints.payment')}</p>
          <Button type="submit" variant="cta" disabled={!canSubmit || submitting}>
            {submitting && <Loader2 className="animate-spin" />}
            {t(submitting ? 'admin.manualSessions.creating' : 'admin.manualSessions.create')}
          </Button>
        </div>
      </form>

      {error && <p role="alert" className={ERROR_BOX}>{error}</p>}

      {created && (
        <div role="status" className={`${SUCCESS_BOX} flex items-start gap-2`}>
          <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-1 min-w-0">
            <span className="font-semibold">{t('admin.manualSessions.created.title')}</span>
            <span>
              {t('admin.manualSessions.created.body', {
                course: created.session?.course?.name ?? '',
                tutor: created.session?.tutor?.name ?? '',
                amount: formatCurrency(created.session?.payment?.amount ?? 0, 'COP'),
              })}
            </span>
            {created.emails?.student && (
              <span>
                {t(created.session?.meetLink ? 'admin.manualSessions.created.emailSent' : 'admin.manualSessions.created.emailSentNoLink', { email: created.sentTo })}
              </span>
            )}
            {created.session?.meetLink && (
              <a className="underline" href={created.session.meetLink} target="_blank" rel="noreferrer">
                {t('admin.manualSessions.created.meetLink')}
              </a>
            )}
          </div>
        </div>
      )}
      {created && !created.emails?.student && (
        <p role="alert" className={ERROR_BOX}>{t('admin.manualSessions.created.emailStudentFailed', { email: created.sentTo })}</p>
      )}
      {created && !created.emails?.tutor && (
        <p role="alert" className={ERROR_BOX}>{t('admin.manualSessions.created.emailTutorFailed')}</p>
      )}
      {created && !created.session?.meetLink && (
        <p role="alert" className={ERROR_BOX}>{t('admin.manualSessions.created.calendarWarning')}</p>
      )}
    </div>
  );
}
