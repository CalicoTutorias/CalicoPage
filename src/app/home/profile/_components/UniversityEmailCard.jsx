'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { GraduationCap, Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { UNIVERSITIES, universityForEmail } from '@/lib/universities/universities';
import { UniversityEmailService } from '@/app/services/core/UniversityEmailService';
import UniversityBadge from '@/app/components/UniversityBadge/UniversityBadge';

const DOMAINS = UNIVERSITIES.flatMap((u) => u.domains.map((d) => `@${d}`)).join(', ');
const INPUT = 'w-full min-w-0 rounded-[var(--control-radius)] border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[var(--calico-orange)]';

/**
 * Profile card: add and verify a university email to earn the public badge.
 * Works for students and tutors, whatever their login email (Gmail included).
 * The email itself stays private; only the badge is public.
 *
 * Props: onBadgeChange(code|null) — lets the page update the badge it shows
 * under the name without refetching the whole user.
 */
export default function UniversityEmailCard({ onBadgeChange, delay = '0.06s' }) {
  const { t, formatDate } = useI18n();
  const uid = useId();
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { tone: 'error' | 'success', text }

  const load = useCallback(async () => {
    const res = await UniversityEmailService.getStatus();
    if (res.ok) {
      setStatus(res.status);
      setLoadError(false);
    } else {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const errorText = (res) => {
    if (res.code === 'COOLDOWN') return t('university.errors.COOLDOWN', { seconds: res.retryAfterSeconds ?? 60 });
    if (res.code && t(`university.errors.${res.code}`) !== `university.errors.${res.code}`) return t(`university.errors.${res.code}`);
    if (res.httpStatus === 429) return t('university.errors.COOLDOWN', { seconds: 60 });
    return t('university.errors.generic');
  };

  const send = async (target) => {
    const value = (target ?? email).trim();
    if (!universityForEmail(value)) {
      setMessage({ tone: 'error', text: t('university.errors.DOMAIN_NOT_ALLOWED') });
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await UniversityEmailService.requestVerification(value);
    setBusy(false);
    if (res.ok) {
      setStatus(res.status);
      setEditing(false);
      setEmail('');
      setMessage({ tone: 'success', text: t('university.sent', { email: value }) });
    } else {
      setMessage({ tone: 'error', text: errorText(res) });
    }
  };

  const remove = async () => {
    if (!window.confirm(t('university.removeConfirm'))) return;
    setBusy(true);
    setMessage(null);
    const res = await UniversityEmailService.remove();
    setBusy(false);
    if (res.ok) {
      setStatus(res.status);
      onBadgeChange?.(null);
    } else {
      setMessage({ tone: 'error', text: errorText(res) });
    }
  };

  const verified = Boolean(status?.email);
  const pending = status?.pendingEmail;
  const showForm = !verified || editing;

  return (
    <section
      className="bg-white rounded-2xl shadow-sm px-5 py-5"
      data-reveal
      style={{ transitionDelay: delay }}
      aria-labelledby={`${uid}-title`}
    >
      <div className="flex items-center gap-2 mb-2">
        <GraduationCap className="w-4 h-4 text-gray-400" aria-hidden="true" />
        <h2 id={`${uid}-title`} className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
          {t('university.title')}
        </h2>
      </div>

      {status === null && !loadError ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          {t('university.loading')}
        </div>
      ) : loadError ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-gray-500">{t('university.errors.load')}</p>
          <Button type="button" variant="outline" size="sm" onClick={load}>{t('university.retry')}</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {verified ? (
            <div className="flex flex-col gap-2">
              <UniversityBadge code={status.university?.code} className="self-start" />
              <p className="text-sm text-gray-700 break-all">{status.email}</p>
              {status.verifiedAt && (
                <p className="text-xs text-gray-400">
                  {t('university.verifiedOn', { date: formatDate(status.verifiedAt, { day: 'numeric', month: 'long', year: 'numeric' }) })}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-600 leading-relaxed">{t('university.description', { domains: DOMAINS })}</p>
          )}

          {pending && (
            <div className="flex items-start gap-2 rounded-[var(--radius-lg)] bg-[var(--calico-info-soft)] text-[var(--calico-info-text)] px-3 py-2">
              <MailCheck className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm break-all">{t('university.pending', { email: pending })}</p>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0 text-[var(--calico-info-text)]"
                  disabled={busy}
                  onClick={() => send(pending)}
                >
                  {t('university.resend')}
                </Button>
              </div>
            </div>
          )}

          {showForm ? (
            <form
              className="flex flex-col sm:flex-row gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <label htmlFor={`${uid}-email`} className="sr-only">{t('university.emailLabel')}</label>
              <input
                id={`${uid}-email`}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={t('university.placeholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT}
                maxLength={254}
                required
              />
              <div className="flex gap-2 shrink-0">
                <Button type="submit" disabled={busy || !email.trim()} className="flex-1 sm:flex-none">
                  {busy ? t('university.sending') : t('university.send')}
                </Button>
                {editing && (
                  <Button type="button" variant="outline" disabled={busy} onClick={() => { setEditing(false); setEmail(''); setMessage(null); }}>
                    {t('university.cancel')}
                  </Button>
                )}
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { setEditing(true); setMessage(null); }}>
                {t('university.change')}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={remove}>
                {t('university.remove')}
              </Button>
            </div>
          )}

          {message && (
            <p
              role={message.tone === 'error' ? 'alert' : 'status'}
              className={`text-sm ${message.tone === 'error' ? 'text-[var(--calico-danger-strong)]' : 'text-[var(--calico-green-success-dark)]'}`}
            >
              {message.text}
            </p>
          )}

          <p className="text-xs text-gray-400 leading-relaxed">{t('university.privacy')}</p>
        </div>
      )}
    </section>
  );
}
