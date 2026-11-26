'use client';

/**
 * Detail of one session under its row in /home/admin/tutorias: who is in it,
 * what the student asked for and uploaded, the tutor's study material and,
 * while nothing ties it to the tutor yet, handing it to another tutor,
 * moving it to another time or canceling it on behalf of Calico.
 *
 * The student's files come with 15-minute links from the detail endpoint; the
 * material block is the shared SessionMaterials (admins can list, download and
 * upload). `onReassigned(detail)` / `onRescheduled(detail)` / `onCanceled(detail)`
 * let the table update the row in place.
 */

import { useEffect, useState } from 'react';
import { CalendarClock, CalendarX2, ExternalLink, FileText, Loader2, UserRoundCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SessionMaterials from '@/app/components/SessionMaterials/SessionMaterials';
import { AdminService } from '@/app/services/core/AdminService';
import { useI18n } from '@/lib/i18n';
import { bogotaLocalToUtc, utcToBogotaLocalInput } from '@/lib/utils/event-format';
import { CARD, ERROR_BOX, HINT, INFO_BOX, INK, INPUT, LABEL, MUTED, SUCCESS_BOX } from '../../eventos/_components/ui';

const NS = 'admin.sessions.detail';
const SECTION = `${CARD} p-4 flex flex-col gap-2`;
const TITLE = `text-sm font-semibold ${INK}`;
const REASSIGN_ERRORS = new Set([
  'TUTOR_NOT_OFFERING', 'SAME_TUTOR', 'SELF_BOOKING', 'SESSION_NOT_REASSIGNABLE', 'SESSION_ENDED',
  'TUTOR_ALREADY_PAID', 'PACKAGE_SESSION', 'SESSION_HAS_REVIEWS', 'SESSION_CONFLICT', 'SESSION_CHANGED',
]);

const CANCEL_ERRORS = new Set(['SESSION_NOT_CANCELABLE', 'TUTOR_ALREADY_PAID', 'SESSION_CHANGED', 'INVALID_REASON']);
const MIN_CANCEL_REASON = 5;
const RESCHEDULE_ERRORS = new Set([
  'SESSION_NOT_RESCHEDULABLE', 'TUTOR_ALREADY_PAID', 'START_IN_PAST', 'SAME_TIME', 'SESSION_CONFLICT',
  'MEET_NOT_SHAREABLE', 'MEET_NOT_ADJACENT', 'SESSION_CHANGED',
]);

const ms = (d) => new Date(d).getTime();

/** The Bogotá wall-clock input as a UTC Date, or null while it is incomplete. */
function toUtc(date, time) {
  if (!date || !time) return null;
  try {
    return bogotaLocalToUtc(`${date}T${time.slice(0, 5)}`);
  } catch {
    return null;
  }
}

const isHttps = (url) => /^https:\/\//i.test(url || '');

function formatSize(bytes, locale) {
  const fmt = (n) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 1 }).format(n);
  if (bytes >= 1024 * 1024) return `${fmt(bytes / 1024 / 1024)} MB`;
  return `${fmt(Math.max(1, bytes / 1024))} KB`;
}

function Person({ person }) {
  return (
    <div className="min-w-0">
      <p className={`text-sm ${INK}`}>{person.name || '—'}</p>
      {person.email && <p className={`text-xs break-all ${MUTED}`}>{person.email}</p>}
      {person.phoneNumber && <p className={`text-xs ${MUTED}`}>{person.phoneNumber}</p>}
    </div>
  );
}

function ReassignForm({ session, onDone }) {
  const { t } = useI18n();
  const [candidates, setCandidates] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [tutorId, setTutorId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    AdminService.listReassignCandidates(session.id).then((res) => {
      if (ignore) return;
      if (res.success) setCandidates(res.candidates || []);
      else setLoadError(true);
    });
    return () => { ignore = true; };
  }, [session.id]);

  const chosen = candidates?.find((c) => c.id === tutorId);

  const submit = async (e) => {
    e.preventDefault();
    if (!chosen || chosen.busy) return;
    if (!window.confirm(t(`${NS}.reassign.confirm`, { from: session.tutor?.name || '—', to: chosen.name }))) return;
    setSubmitting(true);
    setError('');
    const res = await AdminService.reassignSessionTutor(session.id, { tutorId, reason: reason.trim() || undefined });
    setSubmitting(false);
    if (!res.success) {
      if (res.status === 429) setError(t(`${NS}.reassign.errors.RATE_LIMITED`));
      else setError(t(REASSIGN_ERRORS.has(res.error) ? `${NS}.reassign.errors.${res.error}` : `${NS}.reassign.errors.generic`));
      return;
    }
    onDone(res);
  };

  if (loadError) return <p className={ERROR_BOX}>{t(`${NS}.reassign.loadError`)}</p>;
  if (!candidates) return <p className={HINT}>{t('common.loading')}</p>;
  if (candidates.length === 0) return <p className={HINT}>{t(`${NS}.reassign.noCandidates`)}</p>;

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className={LABEL}>{t(`${NS}.reassign.tutorLabel`)}</span>
        <select className={INPUT} value={tutorId} onChange={(e) => setTutorId(e.target.value)} required>
          <option value="">{t(`${NS}.reassign.tutorPlaceholder`)}</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id} disabled={c.busy}>
              {c.busy ? t(`${NS}.reassign.busyOption`, { name: c.name }) : c.name}
            </option>
          ))}
        </select>
        <span className={HINT}>{t(`${NS}.reassign.tutorHint`)}</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>{t(`${NS}.reassign.reasonLabel`)}</span>
        <textarea
          className={INPUT}
          rows={2}
          maxLength={500}
          value={reason}
          placeholder={t(`${NS}.reassign.reasonPlaceholder`)}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <p className={HINT}>{t(`${NS}.reassign.whatHappens`)}</p>
      {error && <p role="alert" className={ERROR_BOX}>{error}</p>}
      <div>
        <Button type="submit" variant="cta" disabled={!chosen || chosen.busy || submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : <UserRoundCog />}
          {submitting ? t(`${NS}.reassign.submitting`) : t(`${NS}.reassign.submit`)}
        </Button>
      </div>
    </form>
  );
}

function RescheduleForm({ session, onDone }) {
  const { t, formatDateTime } = useI18n();
  const initial = utcToBogotaLocalInput(session.startTimestamp);
  const [date, setDate] = useState(initial.slice(0, 10));
  const [time, setTime] = useState(initial.slice(11, 16));
  const [siblings, setSiblings] = useState([]);
  const [shareMeet, setShareMeet] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    // Without siblings the form still works; it just cannot offer a shared Meet.
    AdminService.listRescheduleSiblings(session.id).then((res) => {
      if (!ignore && res.success) setSiblings(res.siblings || []);
    });
    return () => { ignore = true; };
  }, [session.id]);

  const durationMs = ms(session.endTimestamp) - ms(session.startTimestamp);
  const start = toUtc(date, time);
  const end = start && new Date(start.getTime() + durationMs);
  const unchanged = start && start.getTime() === ms(session.startTimestamp);
  // Back to back with the same tutor and student: the one ending at the new
  // start (the block's earlier hour) first, else the one starting at its end.
  const adjacent = start
    ? siblings.find((sb) => ms(sb.endTimestamp) === start.getTime())
      ?? siblings.find((sb) => ms(sb.startTimestamp) === end.getTime())
      ?? null
    : null;
  const willShare = Boolean(adjacent && shareMeet && session.hasCalendarEvent);
  const when = start ? formatDateTime(start) : '';

  const submit = async (e) => {
    e.preventDefault();
    if (!start || unchanged) return;
    if (!window.confirm(t(`${NS}.reschedule.confirm`, { when }))) return;
    setSubmitting(true);
    setError('');
    const res = await AdminService.rescheduleSession(session.id, {
      startTimestamp: start.toISOString(),
      shareMeetWithSessionId: willShare ? adjacent.id : undefined,
    });
    setSubmitting(false);
    if (!res.success) {
      if (res.status === 429) setError(t(`${NS}.reschedule.errors.RATE_LIMITED`));
      else setError(t(RESCHEDULE_ERRORS.has(res.error) ? `${NS}.reschedule.errors.${res.error}` : `${NS}.reschedule.errors.generic`));
      return;
    }
    onDone(res);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>{t(`${NS}.reschedule.dateLabel`)}</span>
          <input type="date" className={INPUT} value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>{t(`${NS}.reschedule.timeLabel`)}</span>
          <input type="time" className={INPUT} value={time} onChange={(e) => setTime(e.target.value)} required />
        </label>
      </div>
      <p className={HINT}>
        {t(`${NS}.reschedule.durationHint`, { minutes: Math.round(durationMs / 60000) })}
      </p>
      {adjacent && session.hasCalendarEvent && (
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={shareMeet} onChange={(e) => setShareMeet(e.target.checked)} />
          <span className={`text-sm ${INK}`}>
            {t(`${NS}.reschedule.shareMeet`, { when: formatDateTime(adjacent.startTimestamp) })}
            <span className={`block ${HINT}`}>{t(`${NS}.reschedule.shareMeetHint`)}</span>
          </span>
        </label>
      )}
      <p className={HINT}>{t(`${NS}.reschedule.whatHappens`)}</p>
      {error && <p role="alert" className={ERROR_BOX}>{error}</p>}
      <div>
        <Button type="submit" variant="cta" disabled={!start || unchanged || submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : <CalendarClock />}
          {submitting ? t(`${NS}.reschedule.submitting`) : t(`${NS}.reschedule.submit`)}
        </Button>
      </div>
    </form>
  );
}

function CancelForm({ session, onDone }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const trimmed = reason.trim();
  const valid = trimmed.length >= MIN_CANCEL_REASON;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    if (!window.confirm(t(`${NS}.cancel.confirm`, { course: session.course?.name || '—' }))) return;
    setSubmitting(true);
    setError('');
    const res = await AdminService.cancelSession(session.id, { reason: trimmed });
    setSubmitting(false);
    if (!res.success) {
      if (res.status === 429) setError(t(`${NS}.cancel.errors.RATE_LIMITED`));
      else setError(t(CANCEL_ERRORS.has(res.error) ? `${NS}.cancel.errors.${res.error}` : `${NS}.cancel.errors.generic`));
      return;
    }
    onDone(res);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className={LABEL}>{t(`${NS}.cancel.reasonLabel`)}</span>
        <textarea
          className={INPUT}
          rows={2}
          maxLength={500}
          required
          value={reason}
          placeholder={t(`${NS}.cancel.reasonPlaceholder`)}
          onChange={(e) => setReason(e.target.value)}
        />
        <span className={HINT}>{t(`${NS}.cancel.reasonHint`, { min: MIN_CANCEL_REASON })}</span>
      </label>
      <p className={HINT}>{t(`${NS}.cancel.whatHappens`)}</p>
      {error && <p role="alert" className={ERROR_BOX}>{error}</p>}
      <div>
        <Button type="submit" variant="destructive" disabled={!valid || submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : <CalendarX2 />}
          {submitting ? t(`${NS}.cancel.submitting`) : t(`${NS}.cancel.submit`)}
        </Button>
      </div>
    </form>
  );
}

export default function SessionDetailPanel({ sessionId, onReassigned, onRescheduled, onCanceled }) {
  const { t, locale, formatCurrency, formatDateTime } = useI18n();
  const [result, setResult] = useState(null); // { key, session, error }
  const [reload, setReload] = useState(0);
  const [reassigning, setReassigning] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [canceling, setCanceling] = useState(false);
  const [cancelOutcome, setCancelOutcome] = useState(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleOutcome, setRescheduleOutcome] = useState(null);
  const requestKey = `${sessionId}|${reload}`;

  useEffect(() => {
    let ignore = false;
    AdminService.getSessionDetail(sessionId).then((res) => {
      if (ignore) return;
      setResult({ key: requestKey, session: res.success ? res.session : null, error: !res.success });
    });
    return () => { ignore = true; };
  }, [requestKey, sessionId]);

  if (result?.key !== requestKey) {
    return <p className={`text-sm ${MUTED}`} aria-busy="true">{t('common.loading')}</p>;
  }
  if (result.error) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <p className={ERROR_BOX}>{t(`${NS}.error`)}</p>
        <Button size="sm" variant="outline" onClick={() => setReload((n) => n + 1)}>{t('admin.sessions.retry')}</Button>
      </div>
    );
  }

  const s = result.session;

  const handleReassigned = (res) => {
    setReassigning(false);
    setOutcome(res);
    setReload((n) => n + 1);
    if (res.session) onReassigned?.(res.session);
  };

  const clearOutcomes = () => {
    setOutcome(null);
    setCancelOutcome(null);
    setRescheduleOutcome(null);
  };

  const handleRescheduled = (res) => {
    setRescheduling(false);
    clearOutcomes();
    setRescheduleOutcome(res);
    setReload((n) => n + 1);
    if (res.session) onRescheduled?.(res.session);
  };

  const handleCanceled = (res) => {
    setCanceling(false);
    clearOutcomes();
    setCancelOutcome(res);
    setReload((n) => n + 1);
    if (res.session) onCanceled?.(res.session);
  };

  return (
    <div className="flex flex-col gap-3">
      {outcome && (
        <div className="flex flex-col gap-1">
          <p className={SUCCESS_BOX}>{t(`${NS}.reassign.done`, { name: outcome.session?.tutor?.name || '' })}</p>
          {outcome.calendar === 'failed' && <p className={ERROR_BOX}>{t(`${NS}.reassign.calendarFailed`)}</p>}
          {outcome.calendar === 'none' && <p className={INFO_BOX}>{t(`${NS}.reassign.calendarNone`)}</p>}
          {outcome.emailsFailed > 0 && (
            <p className={ERROR_BOX}>{t(`${NS}.reassign.emailsFailed`, { count: outcome.emailsFailed })}</p>
          )}
        </div>
      )}

      {rescheduleOutcome && (
        <div className="flex flex-col gap-1">
          <p className={SUCCESS_BOX}>
            {t(`${NS}.reschedule.done`, { when: rescheduleOutcome.session ? formatDateTime(rescheduleOutcome.session.startTimestamp) : '' })}
          </p>
          {rescheduleOutcome.meet === 'shared' && <p className={INFO_BOX}>{t(`${NS}.reschedule.meetShared`)}</p>}
          {rescheduleOutcome.calendar === 'failed' && <p className={ERROR_BOX}>{t(`${NS}.reschedule.calendarFailed`)}</p>}
          {rescheduleOutcome.calendar === 'none' && <p className={INFO_BOX}>{t(`${NS}.reschedule.calendarNone`)}</p>}
          {rescheduleOutcome.calendar === 'updated' && rescheduleOutcome.meet === 'failed' && (
            <p className={ERROR_BOX}>{t(`${NS}.reschedule.meetFailed`)}</p>
          )}
        </div>
      )}

      {cancelOutcome && (
        <div className="flex flex-col gap-1">
          <p className={SUCCESS_BOX}>{t(`${NS}.cancel.done`)}</p>
          {cancelOutcome.calendar === 'failed' && <p className={ERROR_BOX}>{t(`${NS}.cancel.calendarFailed`)}</p>}
          {cancelOutcome.emailsFailed > 0 && (
            <p className={ERROR_BOX}>{t(`${NS}.cancel.emailsFailed`, { count: cancelOutcome.emailsFailed })}</p>
          )}
          {cancelOutcome.refundPending && <p className={INFO_BOX}>{t(`${NS}.cancel.refundPending`)}</p>}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <section className={SECTION}>
          <h3 className={TITLE}>{t(`${NS}.people`)}</h3>
          <div className="flex flex-col gap-3">
            <div>
              <p className={LABEL}>{t(`${NS}.tutor`)}</p>
              <Person person={s.tutor} />
            </div>
            <div className="flex flex-col gap-2">
              <p className={LABEL}>{t(`${NS}.students`)}</p>
              {s.students.length === 0
                ? <p className={`text-sm ${MUTED}`}>—</p>
                : s.students.map((u) => <Person key={u.id} person={u} />)}
            </div>
            {isHttps(s.meetLink) && (
              <a
                href={s.meetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--calico-info-text)] hover:underline break-all"
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {s.meetLink}
              </a>
            )}
            {s.payments.map((p) => (
              <p key={p.id} className={`text-xs ${MUTED}`}>
                {t(`${NS}.payment`, {
                  amount: formatCurrency(p.amount, 'COP'),
                  status: t(`admin.sessions.payment.${p.status}`),
                  payout: t(`${NS}.payout.${p.tutorPayoutStatus}`),
                })}
              </p>
            ))}
          </div>
        </section>

        <section className={SECTION}>
          <h3 className={TITLE}>{t(`${NS}.request`)}</h3>
          <p className={LABEL}>{t(`${NS}.topics`)}</p>
          <p className={`text-sm whitespace-pre-wrap break-words ${s.topicsToReview ? INK : MUTED}`}>
            {s.topicsToReview || t(`${NS}.noTopics`)}
          </p>
          {s.notes && (
            <>
              <p className={LABEL}>{t(`${NS}.notes`)}</p>
              <p className={`text-xs whitespace-pre-wrap break-words ${MUTED}`}>{s.notes}</p>
            </>
          )}
        </section>
      </div>

      <section className={SECTION}>
        <h3 className={TITLE}>{t(`${NS}.studentFiles`, { count: s.attachments.length })}</h3>
        {s.attachments.length === 0 ? (
          <p className={`text-xs ${MUTED}`}>{t(`${NS}.noStudentFiles`)}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {s.attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 flex-wrap">
                <span className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 shrink-0 text-[var(--calico-slate-500)]" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className={`block text-sm break-all ${INK}`}>{a.fileName}</span>
                    <span className={`block text-xs ${MUTED}`}>
                      {formatSize(a.fileSize, locale)} · {formatDateTime(a.uploadedAt)}
                    </span>
                  </span>
                </span>
                {isHttps(a.downloadUrl) && (
                  <Button asChild size="sm" variant="outline">
                    <a href={a.downloadUrl} target="_blank" rel="noopener noreferrer">
                      {t(`${NS}.open`)}
                    </a>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className={HINT}>{t(`${NS}.linksExpire`)}</p>
      </section>

      <SessionMaterials sessionId={s.id} />

      <section className={SECTION}>
        <h3 className={TITLE}>{t(`${NS}.reassign.title`)}</h3>
        {!s.reassign.allowed ? (
          <p className={`text-xs ${MUTED}`}>{t(`${NS}.reassign.blocked.${s.reassign.blocker}`)}</p>
        ) : reassigning ? (
          <>
            <ReassignForm session={s} onDone={handleReassigned} />
            <div>
              <Button size="sm" variant="ghost" onClick={() => setReassigning(false)}>{t(`${NS}.reassign.cancel`)}</Button>
            </div>
          </>
        ) : (
          <>
            <p className={`text-xs ${MUTED}`}>{t(`${NS}.reassign.intro`)}</p>
            <div>
              <Button size="sm" variant="outline" onClick={() => { clearOutcomes(); setReassigning(true); }}>
                <UserRoundCog />
                {t(`${NS}.reassign.open`)}
              </Button>
            </div>
          </>
        )}
      </section>

      {s.reschedule.allowed && (
        <section className={SECTION}>
          <h3 className={TITLE}>{t(`${NS}.reschedule.title`)}</h3>
          {rescheduling ? (
            <>
              <RescheduleForm session={s} onDone={handleRescheduled} />
              <div>
                <Button size="sm" variant="ghost" onClick={() => setRescheduling(false)}>{t(`${NS}.reschedule.back`)}</Button>
              </div>
            </>
          ) : (
            <>
              <p className={`text-xs ${MUTED}`}>{t(`${NS}.reschedule.intro`)}</p>
              <div>
                <Button size="sm" variant="outline" onClick={() => { clearOutcomes(); setRescheduling(true); }}>
                  <CalendarClock />
                  {t(`${NS}.reschedule.open`)}
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      {s.cancel.allowed && (
        <section className={SECTION}>
          <h3 className={TITLE}>{t(`${NS}.cancel.title`)}</h3>
          {canceling ? (
            <>
              <CancelForm session={s} onDone={handleCanceled} />
              <div>
                <Button size="sm" variant="ghost" onClick={() => setCanceling(false)}>{t(`${NS}.cancel.back`)}</Button>
              </div>
            </>
          ) : (
            <>
              <p className={`text-xs ${MUTED}`}>{t(`${NS}.cancel.intro`)}</p>
              <div>
                <Button size="sm" variant="outline" onClick={() => { clearOutcomes(); setCanceling(true); }}>
                  <CalendarX2 />
                  {t(`${NS}.cancel.open`)}
                </Button>
              </div>
            </>
          )}
        </section>
      )}
      {!s.cancel.allowed && s.cancel.blocker === 'TUTOR_ALREADY_PAID' && (
        <section className={SECTION}>
          <h3 className={TITLE}>{t(`${NS}.cancel.title`)}</h3>
          <p className={`text-xs ${MUTED}`}>{t(`${NS}.cancel.blocked.TUTOR_ALREADY_PAID`)}</p>
        </section>
      )}
    </div>
  );
}
