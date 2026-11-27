"use client";

/**
 * /invitacion/[key] — a guest answers an invitation to a group tutoring session.
 *
 * `key` is the secret token of the invitation email or, for the account the
 * invitation was addressed to, its id (the in-app notification links there).
 * The page is public: a guest may not have an account yet. Seeing the
 * invitation needs no login; ACCEPTING does, so an anonymous visitor is sent
 * through login / registration and comes back here (same handoff the booking
 * page uses: ?returnTo= plus the localStorage entry that survives the email
 * verification detour).
 *
 * Nothing is decided here: every state comes from the server
 * (session-invitation.service), which re-checks everything on accept.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, Calendar, CheckCircle2, User, Users, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { withReturnTo } from '@/lib/utils/returnTo';
import routes from '../../../routes';
import { useAuth } from '../../context/SecureAuthContext';
import { SessionInvitationService } from '../../services/core/SessionInvitationService';
import { clearPendingBooking, savePendingBooking } from '../../services/utils/pendingBooking';
import EventsHeader from '../../eventos/EventsHeader';

/** Server refusals of accept / decline → i18n keys. */
const ERROR_KEYS = {
  NOT_FOUND: 'invitation.errors.NOT_FOUND',
  INVITATION_NOT_PENDING: 'invitation.errors.INVITATION_NOT_PENDING',
  SESSION_NOT_ACTIVE: 'invitation.errors.SESSION_NOT_ACTIVE',
  SESSION_STARTED: 'invitation.errors.SESSION_STARTED',
  SESSION_FULL: 'invitation.errors.SESSION_FULL',
  ALREADY_JOINED: 'invitation.errors.ALREADY_JOINED',
  SELF_BOOKING: 'invitation.errors.SELF_BOOKING',
  RATE_LIMITED: 'invitation.errors.RATE_LIMITED',
};

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-lg bg-[var(--calico-orange-soft)] flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-[var(--calico-orange-text)]" aria-hidden="true" />
      </div>
      <div className="min-w-0 pt-0.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        <div className="text-sm font-semibold text-gray-900 break-words">{children}</div>
      </div>
    </div>
  );
}

function Notice({ tone = 'info', children }) {
  const tones = {
    info: 'bg-[var(--calico-info-soft)] text-[var(--calico-info-text)]',
    warning: 'bg-[var(--calico-warning-soft)] text-[var(--calico-warning-text)]',
    error: 'bg-[var(--calico-danger-soft)] text-[var(--calico-danger-strong)]',
  };
  return <p role="status" className={`rounded-lg px-4 py-3 text-sm ${tones[tone]}`}>{children}</p>;
}

export default function InvitationView({ invitationKey }) {
  const router = useRouter();
  const { t, formatDate, locale } = useI18n();
  const { user, loading: authLoading } = useAuth();
  const isLoggedIn = Boolean(user?.isLoggedIn);

  // 'loading' | 'ready' | 'missing' | 'login-required' | 'error'
  const [status, setStatus] = useState('loading');
  const [invitation, setInvitation] = useState(null);
  const [busy, setBusy] = useState(null); // 'accept' | 'decline' | null
  const [errorCode, setErrorCode] = useState(null);
  const [joined, setJoined] = useState(null); // session returned by accept
  const [declined, setDeclined] = useState(false);

  const [version, setVersion] = useState(0); // bumped to read the invitation again

  // Read once auth settles (the answer depends on who is looking) and again
  // whenever `reload` asks for it.
  useEffect(() => {
    if (authLoading) return undefined;
    let active = true;
    SessionInvitationService.preview(invitationKey).then((res) => {
      if (!active) return;
      if (res.success) {
        setInvitation(res.invitation);
        setStatus('ready');
      } else if (res.status === 401) {
        setStatus('login-required');
      } else if (res.status === 404) {
        setStatus('missing');
      } else {
        setStatus('error');
      }
    });
    return () => { active = false; };
  }, [authLoading, isLoggedIn, invitationKey, version]);

  const reload = () => setVersion((v) => v + 1);

  // Back from login / registration: the handoff is fulfilled.
  useEffect(() => {
    if (isLoggedIn) clearPendingBooking();
  }, [isLoggedIn]);

  const goAuth = (path) => {
    const here = window.location.pathname;
    savePendingBooking(here);
    router.push(withReturnTo(path, here));
  };

  const accept = async () => {
    setBusy('accept');
    setErrorCode(null);
    const res = await SessionInvitationService.accept(invitationKey);
    setBusy(null);
    if (res.success) {
      setJoined(res.session);
      return;
    }
    setErrorCode(res.code);
    reload(); // the invitation may have closed meanwhile: show its real state
  };

  const decline = async () => {
    setBusy('decline');
    setErrorCode(null);
    const res = await SessionInvitationService.decline(invitationKey);
    setBusy(null);
    if (res.success) setDeclined(true);
    else {
      setErrorCode(res.code);
      reload();
    }
  };

  const errorText = errorCode ? t(ERROR_KEYS[errorCode] || 'invitation.errors.GENERIC') : '';

  let body;
  if (status === 'loading' || authLoading) {
    body = <p className="text-sm text-gray-500 text-center py-8">{t('invitation.loading')}</p>;
  } else if (status === 'missing') {
    body = (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-bold text-gray-900">{t('invitation.missing.title')}</h1>
        <p className="text-sm text-gray-600">{t('invitation.missing.body')}</p>
        <Button asChild variant="outline"><Link href={routes.LANDING}>{t('invitation.goHome')}</Link></Button>
      </div>
    );
  } else if (status === 'login-required') {
    body = (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-bold text-gray-900">{t('invitation.loginRequired.title')}</h1>
        <p className="text-sm text-gray-600">{t('invitation.loginRequired.body')}</p>
        <Button variant="cta" size="lg" onClick={() => goAuth(routes.LOGIN)}>{t('invitation.login')}</Button>
      </div>
    );
  } else if (status === 'error') {
    body = (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-bold text-gray-900">{t('invitation.loadError.title')}</h1>
        <p className="text-sm text-gray-600">{t('invitation.loadError.body')}</p>
        <Button variant="outline" onClick={() => { setStatus('loading'); reload(); }}>{t('invitation.retry')}</Button>
      </div>
    );
  } else if (joined) {
    body = (
      <div className="space-y-5 text-center">
        <CheckCircle2 className="w-12 h-12 mx-auto text-[var(--calico-green-success)]" aria-hidden="true" />
        <h1 className="text-xl font-bold text-gray-900">{t('invitation.joined.title')}</h1>
        <p className="text-sm text-gray-600">{t('invitation.joined.body')}</p>
        <div className="flex flex-col gap-3">
          {joined.googleMeetLink && (
            <Button asChild variant="cta" size="lg">
              <a href={joined.googleMeetLink} target="_blank" rel="noopener noreferrer">
                <Video aria-hidden="true" />
                {t('invitation.joined.meet')}
              </a>
            </Button>
          )}
          <Button asChild variant="outline" size="lg">
            <Link href={routes.HISTORY}>{t('invitation.joined.history')}</Link>
          </Button>
        </div>
      </div>
    );
  } else if (declined) {
    body = (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-bold text-gray-900">{t('invitation.declined.title')}</h1>
        <p className="text-sm text-gray-600">{t('invitation.declined.body')}</p>
        <Button asChild variant="outline"><Link href={routes.LANDING}>{t('invitation.goHome')}</Link></Button>
      </div>
    );
  } else {
    const { state, viewer } = invitation;
    const start = new Date(invitation.startTimestamp);
    const end = new Date(invitation.endTimestamp);
    const day = formatDate(start, { weekday: 'long', day: 'numeric', month: 'long' });
    const time = (d) => d.toLocaleTimeString(locale === 'en' ? 'en-US' : 'es-CO', { hour: '2-digit', minute: '2-digit' });
    const mine = viewer?.alreadyJoined || viewer?.acceptedByMe;
    const canAnswer = state === 'open' && !viewer?.isTutor && !viewer?.alreadyJoined;

    let notice = null;
    if (mine) notice = <Notice>{t('invitation.state.mine')}</Notice>;
    else if (viewer?.isTutor) notice = <Notice tone="warning">{t('invitation.state.tutor')}</Notice>;
    else if (state === 'accepted') notice = <Notice tone="warning">{t('invitation.state.used')}</Notice>;
    else if (state === 'closed') notice = <Notice tone="warning">{t('invitation.state.closed')}</Notice>;
    else if (state === 'expired') notice = <Notice tone="warning">{t('invitation.state.expired')}</Notice>;
    else if (state === 'full') notice = <Notice tone="warning">{t('invitation.state.full')}</Notice>;

    body = (
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--calico-orange-text)]">
            {t('invitation.eyebrow')}
          </p>
          <h1 className="text-xl font-bold text-gray-900 mt-1">
            {invitation.inviterName
              ? t('invitation.title', { name: invitation.inviterName })
              : t('invitation.titleNoName')}
          </h1>
          {canAnswer && <p className="text-sm text-gray-600 mt-2">{t('invitation.subtitle')}</p>}
        </div>

        <div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
          <Row icon={BookOpen} label={t('invitation.course')}>{invitation.course?.name || '—'}</Row>
          <Row icon={User} label={t('invitation.tutor')}>{invitation.tutor?.name || '—'}</Row>
          <Row icon={Calendar} label={t('invitation.when')}>
            <span className="capitalize">{day}</span>
            <span className="block font-normal text-gray-600">{time(start)} – {time(end)}</span>
          </Row>
          <Row icon={Users} label={t('invitation.seats')}>
            {t('invitation.seatsValue', { taken: invitation.seats.taken, total: invitation.seats.total })}
          </Row>
        </div>

        {notice}
        {errorText && <Notice tone="error">{errorText}</Notice>}

        {mine && (
          <Button asChild variant="cta" size="lg" className="w-full">
            <Link href={routes.HISTORY}>{t('invitation.joined.history')}</Link>
          </Button>
        )}

        {canAnswer && isLoggedIn && (
          <div className="flex flex-col gap-3">
            <Button variant="cta" size="lg" onClick={accept} disabled={Boolean(busy)}>
              {busy === 'accept' ? t('invitation.accepting') : t('invitation.accept')}
            </Button>
            <Button variant="outline" size="lg" onClick={decline} disabled={Boolean(busy)}>
              {busy === 'decline' ? t('invitation.declining') : t('invitation.decline')}
            </Button>
          </div>
        )}

        {canAnswer && !isLoggedIn && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">{t('invitation.needAccount')}</p>
            <Button variant="cta" size="lg" onClick={() => goAuth(routes.LOGIN)}>{t('invitation.login')}</Button>
            <Button variant="outline" size="lg" onClick={() => goAuth(routes.REGISTER)}>{t('invitation.register')}</Button>
            <Button variant="ghost" onClick={decline} disabled={Boolean(busy)}>
              {busy === 'decline' ? t('invitation.declining') : t('invitation.decline')}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--calico-slate-50)]">
      <EventsHeader backHref={isLoggedIn ? routes.HOME : routes.LANDING} backLabel={t('invitation.back')} />
      <main className="max-w-md mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">{body}</div>
      </main>
    </div>
  );
}
