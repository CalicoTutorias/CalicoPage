'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Ban, BellRing, Check, ClipboardList, Copy, EyeOff, Pencil, Send, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminEventService } from '@/app/services/core/AdminEventService';
import { useI18n } from '@/lib/i18n';
import { MIN_CHARGE_COP } from '@/lib/payments/fees';
import { formatEventDate, formatEventTimeRange, joinNames } from '@/lib/utils/event-format';
import routes from '@/routes';
import ConfirmDialog from '../_components/ConfirmDialog';
import EventForm from '../_components/EventForm';
import EventStatusBadge from '../_components/EventStatusBadge';
import PaymentsTab from '../_components/PaymentsTab';
import RegistrationsTab from '../_components/RegistrationsTab';
import SurveyTab from '../_components/SurveyTab';
import TutorPayoutsTab from '../_components/TutorPayoutsTab';
import {
  CARD, CHIP, ERROR_BOX, INFO_BOX, INK, INPUT, LABEL, MUTED, SUCCESS_BOX, TONE,
} from '../_components/ui';

const TABS = ['registrations', 'payments', 'survey', 'tutors'];

/** Actions per derived status (spec §5.9, §7). Finished events only get the survey reminder. */
const ACTIONS_BY_STATUS = {
  draft: ['publish', 'edit', 'delete'],
  published: ['edit', 'remind', 'cancel'],
  finished: ['surveyReminder'],
  canceled: [],
};

const ACTION_UI = {
  publish: { Icon: Send, variant: 'cta' },
  edit: { Icon: Pencil, variant: 'outline' },
  remind: { Icon: BellRing, variant: 'outline' },
  surveyReminder: { Icon: ClipboardList, variant: 'outline' },
  delete: { Icon: Trash2, variant: 'destructive' },
  cancel: { Icon: Ban, variant: 'destructive' },
};

/** Reminder results come back as lists of users (or counts). */
const countOf = (v) => (Array.isArray(v) ? v.length : Number(v) || 0);

const NOTICE_BOX = { success: SUCCESS_BOX, error: ERROR_BOX, info: INFO_BOX };

/**
 * Admin detail of one event: header with status, public link and the actions
 * allowed in its state (each behind a ConfirmDialog), inline edit, and the
 * registrations / payments / survey / tutor payouts tabs.
 */
export default function AdminEventDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { t, formatCurrency, locale } = useI18n();

  const [event, setEvent] = useState(null);
  const [loadError, setLoadError] = useState(null); // 'notFound' | 'load'
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('registrations');
  const [notice, setNotice] = useState(null); // { tone, text }

  const [pending, setPending] = useState(null); // action awaiting confirmation
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState(null);
  const [cancelReason, setCancelReason] = useState('');

  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState(false);
  const linkRef = useRef(null);

  const load = useCallback(
    () => AdminEventService.get(id).then((res) => {
      if (res.success) {
        setEvent(res.event);
        setLoadError(null);
      } else {
        setLoadError(res.status === 404 || res.status === 400 ? 'notFound' : 'load');
      }
    }),
    [id],
  );

  useEffect(() => { load(); }, [load]);

  const backLink = (
    <Link
      href={routes.ADMIN_EVENTS}
      className="self-start flex items-center gap-1 text-sm font-medium text-[var(--calico-orange-text)] hover:text-[var(--calico-orange-text-hover)]"
    >
      <ArrowLeft className="w-4 h-4" />
      {t('admin.events.backToList')}
    </Link>
  );

  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <p className={ERROR_BOX}>
          {loadError === 'notFound' ? t('admin.events.detail.notFound') : t('admin.events.errors.loadEvent')}
        </p>
      </div>
    );
  }
  if (!event) return <p className={`text-sm ${MUTED}`}>{t('common.loading')}</p>;

  const status = event.derivedStatus;
  const confirmedCount = event.stats?.confirmed ?? 0;
  const publicPath = routes.EVENT_DETAIL(event.slug);
  const publicUrl = typeof window === 'undefined' ? publicPath : `${window.location.origin}${publicPath}`;

  // ─── Actions ─────────────────────────────────────────────────────────

  const actionError = (res) => {
    if (res.code === 'EMAIL_TEMPLATE_NOT_CONFIGURED') return t('admin.events.errors.templateMissing');
    if (res.code === 'REMINDER_COOLDOWN') return t('admin.events.errors.REMINDER_COOLDOWN');
    if (res.code === 'CALENDAR_ERROR') return t('admin.events.errors.calendar');
    if (res.code === 'INVALID_STATE') return t('admin.events.errors.INVALID_STATE');
    if (res.code === 'VALIDATION_ERROR' && res.rule) {
      const key = `admin.events.form.errors.${res.rule}`;
      const text = t(key, { min: formatCurrency(MIN_CHARGE_COP, 'COP') });
      if (text !== key) return text;
    }
    return res.error || t('admin.events.errors.generic');
  };

  const openAction = (action) => {
    if (action === 'edit') {
      setNotice(null);
      setEditing(true);
      return;
    }
    setDialogError(null);
    setCancelReason('');
    setPending(action);
  };

  const closeDialog = () => {
    setPending(null);
    setDialogError(null);
  };

  const runAction = async () => {
    const action = pending;
    setBusy(true);
    setDialogError(null);
    let res;
    if (action === 'publish') res = await AdminEventService.publish(event.id);
    else if (action === 'delete') res = await AdminEventService.remove(event.id);
    else if (action === 'cancel') res = await AdminEventService.cancel(event.id, cancelReason.trim() || null);
    else if (action === 'remind') res = await AdminEventService.remind(event.id);
    else res = await AdminEventService.surveyReminder(event.id);
    setBusy(false);

    if (!res.success) {
      setDialogError(actionError(res));
      return;
    }
    closeDialog();

    if (action === 'delete') {
      router.push(routes.ADMIN_EVENTS);
      return;
    }
    if (action === 'remind' || action === 'surveyReminder') {
      const counts = { sent: countOf(res.sent), failed: countOf(res.failed), skipped: countOf(res.skipped) };
      const key = action === 'remind' ? 'remindResult' : 'surveyReminderResult';
      setNotice({ tone: counts.failed > 0 ? 'error' : 'success', text: t(`admin.events.messages.${key}`, counts) });
    } else {
      setNotice({ tone: 'success', text: t(`admin.events.messages.${action === 'publish' ? 'published' : 'canceled'}`) });
    }
    await load();
  };

  const onSaved = async (_updated, { calendarWarning } = {}) => {
    setEditing(false);
    if (calendarWarning) setNotice({ tone: 'error', text: t('admin.events.messages.calendarWarning') });
    else setNotice({ tone: 'success', text: t(`admin.events.messages.${event.status === 'Published' ? 'savedPublished' : 'saved'}`) });
    await load();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopyFallback(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      linkRef.current?.focus();
      linkRef.current?.select();
      setCopyFallback(true);
    }
  };

  const dialog = {
    publish: {
      title: t('admin.events.confirm.publish.title'),
      message: (
        <>
          <p>{t('admin.events.confirm.publish.body')}</p>
          {event.autoMeet && <p>{t('admin.events.confirm.publish.autoMeet')}</p>}
          {!event.isListed && <p>{t('admin.events.confirm.publish.hidden')}</p>}
        </>
      ),
      confirmLabel: t('admin.events.confirm.publish.confirm'),
    },
    delete: {
      title: t('admin.events.confirm.delete.title'),
      message: t('admin.events.confirm.delete.body', { title: event.title }),
      confirmLabel: t('admin.events.confirm.delete.confirm'),
      destructive: true,
    },
    cancel: {
      title: t('admin.events.confirm.cancel.title'),
      message: t('admin.events.confirm.cancel.body', { count: confirmedCount }),
      confirmLabel: t('admin.events.confirm.cancel.confirm'),
      destructive: true,
    },
    remind: {
      title: t('admin.events.confirm.remind.title'),
      message: t('admin.events.confirm.remind.body', { count: confirmedCount }),
      confirmLabel: t('admin.events.confirm.remind.confirm'),
    },
    surveyReminder: {
      title: t('admin.events.confirm.surveyReminder.title'),
      message: t('admin.events.confirm.surveyReminder.body'),
      confirmLabel: t('admin.events.confirm.surveyReminder.confirm'),
    },
  }[pending] ?? {};

  // ─── Render ──────────────────────────────────────────────────────────

  const priceText = event.price > 0 ? formatCurrency(event.price, 'COP') : t('admin.events.list.free');
  const tutorNames = joinNames((event.tutors || []).map((x) => x.name), locale);

  return (
    <div className="flex flex-col gap-4">
      {backLink}

      {notice && <p role="status" className={NOTICE_BOX[notice.tone]}>{notice.text}</p>}

      {editing ? (
        <EventForm event={event} onSaved={onSaved} onCancel={() => setEditing(false)} />
      ) : (
        <section className={`${CARD} p-4 sm:p-5 flex flex-col gap-4`}>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={`text-lg font-bold ${INK} min-w-0 break-words`}>{event.title}</h2>
              <EventStatusBadge status={status} />
              {!event.isListed && (
                <span className={`${CHIP} ${TONE.neutral} gap-1`} title={t('admin.events.detail.hiddenHint')}>
                  <EyeOff className="w-3 h-3" />
                  {t('admin.events.detail.hidden')}
                </span>
              )}
            </div>
            <p className={`text-sm ${INK}`}>
              <span className="first-letter:uppercase inline-block">{formatEventDate(event.startsAt, locale)}</span>
              {' · '}
              {formatEventTimeRange(event.startsAt, event.endsAt, locale)}
              <span className={MUTED}> ({t('admin.events.form.hints.bogota')})</span>
            </p>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div className="min-w-0">
              <dt className={LABEL}>
                {event.modality === 'Virtual' ? t('admin.events.detail.meetingLink') : t('admin.events.detail.location')}
              </dt>
              <dd className={`${INK} break-all`}>
                {event.modality === 'Virtual'
                  ? (event.meetingUrl
                    ? <a href={event.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--calico-orange-text)] hover:underline">{event.meetingUrl}</a>
                    : <span className={MUTED}>{event.autoMeet ? t('admin.events.detail.meetCreatedOnPublish') : '—'}</span>)
                  : event.location || '—'}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className={LABEL}>{t('admin.events.detail.price')}</dt>
              <dd className={INK}>
                {priceText}
                {event.earlyBirdSlots != null && (
                  <span className={`block text-xs ${MUTED}`}>
                    {t('admin.events.detail.earlyBird', { slots: event.earlyBirdSlots, percent: event.earlyBirdPercent })}
                  </span>
                )}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className={LABEL}>{t('admin.events.detail.tutors')}</dt>
              <dd className={INK}>{tutorNames || '—'}</dd>
            </div>
            <div className="min-w-0">
              <dt className={LABEL}>{t('admin.events.detail.course')}</dt>
              <dd className={INK}>{event.course ? `${event.course.code} · ${event.course.name}` : '—'}</dd>
            </div>
          </dl>

          {status === 'canceled' && (
            <p className={ERROR_BOX}>
              {event.cancelReason
                ? t('admin.events.detail.canceledReason', { reason: event.cancelReason })
                : t('admin.events.detail.canceledNoReason')}
            </p>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="admin-event-public-link" className={LABEL}>{t('admin.events.detail.publicLink')}</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="admin-event-public-link"
                ref={linkRef}
                readOnly
                value={publicUrl}
                onFocus={(e) => e.target.select()}
                className={`${INPUT} font-mono text-xs`}
              />
              <Button variant="outline" onClick={copyLink} className="shrink-0">
                {copied ? <Check /> : <Copy />}
                {copied ? t('admin.events.detail.copied') : t('admin.events.detail.copyLink')}
              </Button>
            </div>
            {status === 'draft' && <p className={`text-xs ${MUTED}`}>{t('admin.events.detail.draftLinkHint')}</p>}
            {copyFallback && <p className={`text-xs ${INK}`}>{t('admin.events.detail.copyFallback')}</p>}
          </div>

          {ACTIONS_BY_STATUS[status]?.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-[var(--calico-slate-100)] pt-4">
              {ACTIONS_BY_STATUS[status].map((action) => {
                const { Icon, variant } = ACTION_UI[action];
                return (
                  <Button key={action} variant={variant} onClick={() => openAction(action)}>
                    <Icon />
                    {t(`admin.events.actions.${action}`)}
                  </Button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {status === 'draft' ? (
        <p className={`text-sm ${MUTED}`}>{t('admin.events.detail.draftTabsHint')}</p>
      ) : (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((key) => (
              <Button
                key={key}
                size="sm"
                variant={tab === key ? 'secondary' : 'outline'}
                className="rounded-full"
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
              >
                {t(`admin.events.detail.tabs.${key}`)}
              </Button>
            ))}
          </div>
          {tab === 'registrations' && <RegistrationsTab eventId={event.id} slug={event.slug} />}
          {tab === 'payments' && <PaymentsTab eventId={event.id} />}
          {tab === 'survey' && <SurveyTab eventId={event.id} />}
          {tab === 'tutors' && <TutorPayoutsTab eventId={event.id} tutors={event.tutors} />}
        </section>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title={dialog.title}
        message={dialog.message}
        confirmLabel={dialog.confirmLabel}
        destructive={dialog.destructive}
        busy={busy}
        error={dialogError}
        onConfirm={runAction}
        onCancel={closeDialog}
      >
        {pending === 'cancel' && (
          <div className="flex flex-col gap-1">
            <label htmlFor="admin-event-cancel-reason" className={LABEL}>{t('admin.events.confirm.cancel.reason')}</label>
            <textarea
              id="admin-event-cancel-reason"
              rows={3}
              maxLength={300}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className={INPUT}
            />
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
