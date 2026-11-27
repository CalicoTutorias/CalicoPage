'use client';

/**
 * "Cambio de horario" card of the session detail (tutor and students).
 *
 *  - An open proposal made TO the user: old and new time, the note, and
 *    Accept / Decline.
 *  - An open proposal made BY the user: what they proposed and "Retirar".
 *  - A guest of a group session: only that a change is proposed (whoever
 *    booked answers for the group).
 *  - No proposal, and the user may make one: a form with the new date and
 *    time (Colombia time; the session keeps its duration) and an optional note.
 *  - Otherwise nothing is rendered.
 *
 * Every rule is enforced by the API (session-reschedule.service); what the
 * card may offer comes from the server (`canPropose`, `canRespond`) and the
 * codes it refuses with are translated under `reschedule.errors`.
 */

import { useEffect, useId, useState } from 'react';
import { ArrowRight, CalendarClock, Check, Loader2, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { bogotaLocalToUtc, utcToBogotaLocalInput } from '@/lib/utils/event-format';
import { RESCHEDULE_MESSAGE_MAX } from '@/lib/sessions/reschedule';
import { SessionRescheduleService } from '../../services/core/SessionRescheduleService';

const KNOWN_ERRORS = new Set([
  'INVALID_TIME', 'START_IN_PAST', 'SAME_TIME', 'TOO_FAR_AHEAD', 'MESSAGE_TOO_LONG',
  'SESSION_NOT_ACTIVE', 'SESSION_STARTED', 'SESSION_CHANGED', 'SESSION_CONFLICT', 'TUTOR_ALREADY_PAID',
  'REQUEST_PENDING', 'REQUEST_NOT_PENDING', 'REQUEST_EXPIRED', 'REQUEST_LIMIT', 'TRY_AGAIN',
  'GUEST_CANNOT_RESCHEDULE', 'RATE_LIMITED',
]);

const WHEN = { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' };
const HOUR = { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' };

const FIELD = 'rounded-[var(--control-radius)] border border-[var(--calico-slate-200)] bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[var(--calico-orange-soft)] focus:border-[var(--calico-orange)] disabled:opacity-50';

function toUtc(date, time) {
  try {
    return bogotaLocalToUtc(`${date}T${time}`);
  } catch {
    return null;
  }
}

export default function RescheduleRequestPanel({ session, isTutor = false, onChanged }) {
  const { t, formatDateTime } = useI18n();
  const uid = useId();
  const [data, setData] = useState(null); // { request, canPropose, role }
  const [version, setVersion] = useState(0); // bumped to read the proposal again
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null); // 'propose' | 'accept' | 'decline' | 'withdraw'
  const [message, setMessage] = useState(null); // { tone: 'error' | 'success' | 'warning', text }
  const [now, setNow] = useState(() => Date.now()); // refreshed when the form opens

  const sessionId = session?.id;
  const startTimestamp = session?.startTimestamp;

  // Re-read whenever the session itself moves (an accepted proposal).
  useEffect(() => {
    if (!sessionId) return undefined;
    let active = true;
    SessionRescheduleService.getForSession(sessionId).then((res) => {
      if (active) setData(res.success ? res : { request: null, canPropose: false, role: null });
    });
    return () => { active = false; };
  }, [sessionId, startTimestamp, version]);

  if (!session || !data) return null;

  const { request, canPropose, role } = data;
  if (!request && !canPropose && !message) return null;

  const when = (value) => formatDateTime(value, WHEN);
  const range = (start, end) => `${when(start)} – ${formatDateTime(end, HOUR)}`;
  const errorText = (code) => t(`reschedule.errors.${KNOWN_ERRORS.has(code) ? code : 'GENERIC'}`);
  const otherSide = t(isTutor ? 'reschedule.theStudent' : 'reschedule.theTutor');
  const accent = isTutor ? 'tutor' : 'cta';

  const durationMs = new Date(session.endTimestamp) - new Date(session.startTimestamp);
  const start = date && time ? toUtc(date, time) : null;
  const end = start ? new Date(start.getTime() + durationMs) : null;
  const unchanged = Boolean(start) && start.getTime() === new Date(session.startTimestamp).getTime();
  const inPast = Boolean(start) && start.getTime() <= now;
  const today = utcToBogotaLocalInput(new Date(now)).slice(0, 10);

  const openForm = () => {
    const current = utcToBogotaLocalInput(session.startTimestamp);
    setDate(current.slice(0, 10));
    setTime(current.slice(11, 16));
    setNote('');
    setMessage(null);
    setNow(Date.now());
    setOpen(true);
  };

  const finish = (res, success) => {
    setBusy(null);
    if (res.success) {
      setMessage(success(res));
      onChanged?.();
    } else {
      setMessage({ tone: 'error', text: errorText(res.code) });
    }
    // Either way the proposal may have moved (a refusal usually means it did).
    setVersion((v) => v + 1);
    return res;
  };

  const propose = async (e) => {
    e.preventDefault();
    if (!start || unchanged || inPast) return;
    setBusy('propose');
    setMessage(null);
    const res = finish(
      await SessionRescheduleService.propose(sessionId, start, note.trim()),
      (r) => (r.emailSent
        ? { tone: 'success', text: t('reschedule.sent', { who: otherSide }) }
        : { tone: 'warning', text: t('reschedule.sentNoEmail', { who: otherSide }) }),
    );
    if (res.success) setOpen(false);
  };

  const answer = async (kind) => {
    setBusy(kind);
    setMessage(null);
    const call = {
      accept: () => SessionRescheduleService.accept(sessionId, request.id),
      decline: () => SessionRescheduleService.decline(sessionId, request.id),
      withdraw: () => SessionRescheduleService.withdraw(sessionId, request.id),
    }[kind];
    finish(await call(), (r) => {
      if (kind === 'accept') {
        return r.calendar === 'failed'
          ? { tone: 'warning', text: t('reschedule.acceptedCalendarFailed', { when: when(r.session?.startTimestamp) }) }
          : { tone: 'success', text: t('reschedule.accepted', { when: when(r.session?.startTimestamp) }) };
      }
      return { tone: 'success', text: t(kind === 'decline' ? 'reschedule.declined' : 'reschedule.withdrawn') };
    });
  };

  const TONE = {
    error: 'text-[var(--calico-danger-strong)]',
    success: 'text-[var(--calico-green-success-dark)]',
    warning: 'text-[var(--calico-warning-text)]',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
        {t('reschedule.title')}
      </h3>

      {request && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-900">
            {request.mine && t('reschedule.mine', { who: otherSide })}
            {!request.mine && request.canRespond && (request.requestedByName
              ? t('reschedule.incoming', { name: request.requestedByName })
              : t('reschedule.incomingNoName'))}
            {!request.mine && !request.canRespond && t('reschedule.guestNotice')}
          </p>

          <dl className="rounded-[var(--control-radius)] bg-[var(--calico-warning-soft)] px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <dt className="text-xs text-gray-600">{t('reschedule.from')}</dt>
              <dd className="text-gray-700 line-through">{range(request.fromStart, request.fromEnd)}</dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2 mt-1">
              <dt className="text-xs text-gray-600 flex items-center gap-1">
                <ArrowRight className="w-3 h-3" aria-hidden="true" />
                {t('reschedule.to')}
              </dt>
              <dd className="font-semibold text-gray-900 first-letter:uppercase">{range(request.toStart, request.toEnd)}</dd>
            </div>
          </dl>

          {request.message && (
            <p className="text-sm text-gray-700 border-l-2 border-[var(--calico-slate-200)] pl-3 break-words">
              {request.message}
            </p>
          )}

          {request.canRespond && (
            <>
              <p className="text-xs text-gray-500">{t('reschedule.answerHint')}</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant={accent} className="flex-1" disabled={Boolean(busy)} onClick={() => answer('accept')}>
                  {busy === 'accept' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
                  {busy === 'accept' ? t('reschedule.accepting') : t('reschedule.accept')}
                </Button>
                <Button variant="outline" className="flex-1" disabled={Boolean(busy)} onClick={() => answer('decline')}>
                  <X aria-hidden="true" />
                  {busy === 'decline' ? t('reschedule.declining') : t('reschedule.decline')}
                </Button>
              </div>
            </>
          )}

          {request.mine && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-gray-500 flex-1 min-w-0">{t('reschedule.waiting', { who: otherSide })}</p>
              <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => answer('withdraw')}>
                <X aria-hidden="true" />
                {busy === 'withdraw' ? t('reschedule.withdrawing') : t('reschedule.withdraw')}
              </Button>
            </div>
          )}
        </div>
      )}

      {!request && canPropose && !open && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            {t(role === 'tutor' ? 'reschedule.introTutor' : 'reschedule.introStudent')}
          </p>
          <Button variant="outline" onClick={openForm}>
            <CalendarClock aria-hidden="true" />
            {t('reschedule.open')}
          </Button>
        </div>
      )}

      {!request && canPropose && open && (
        <form onSubmit={propose} className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <label htmlFor={`${uid}-date`} className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
              {t('reschedule.dateLabel')}
              <input
                id={`${uid}-date`}
                type="date"
                required
                min={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={Boolean(busy)}
                className={FIELD}
              />
            </label>
            <label htmlFor={`${uid}-time`} className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
              {t('reschedule.timeLabel')}
              <input
                id={`${uid}-time`}
                type="time"
                required
                step={300}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={Boolean(busy)}
                className={FIELD}
              />
            </label>
          </div>

          <p className="text-xs text-gray-500" aria-live="polite">
            {start && !unchanged && !inPast
              ? t('reschedule.preview', { range: range(start, end) })
              : t(inPast ? 'reschedule.errors.START_IN_PAST' : 'reschedule.durationHint', {
                  minutes: Math.round(durationMs / 60000),
                })}
          </p>

          <label htmlFor={`${uid}-note`} className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
            {t('reschedule.noteLabel')}
            <textarea
              id={`${uid}-note`}
              rows={2}
              maxLength={RESCHEDULE_MESSAGE_MAX}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('reschedule.notePlaceholder')}
              disabled={Boolean(busy)}
              className={`${FIELD} font-normal resize-y`}
            />
          </label>

          <p className="text-xs text-gray-500">{t('reschedule.whatHappens', { who: otherSide })}</p>

          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => setOpen(false)}>
              {t('reschedule.cancel')}
            </Button>
            <Button type="submit" variant={accent} className="flex-1" disabled={Boolean(busy) || !start || unchanged || inPast}>
              {busy === 'propose' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
              {busy === 'propose' ? t('reschedule.sending') : t('reschedule.send')}
            </Button>
          </div>
        </form>
      )}

      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={`mt-3 text-sm ${TONE[message.tone]}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
