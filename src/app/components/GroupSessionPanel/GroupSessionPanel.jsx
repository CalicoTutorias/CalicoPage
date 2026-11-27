'use client';

/**
 * Group card of the session detail: who takes the session, how many paid
 * seats are confirmed and — for the student who booked — the invitations
 * (invite one more guest, send again, withdraw).
 *
 *  - The tutor already sees every student above this card, so here they only
 *    get the seat count (how many are confirmed, how many still pending).
 *  - Students see the names of the group, never each other's email.
 *  - Only the organiser gets the invited addresses and the actions, and only
 *    while the session has not started (`canManage` comes from the server).
 *
 * Every rule is enforced by the API (session-invitation.service); the codes it
 * answers are translated under `groupSession.errors`.
 */

import { useEffect, useId, useState } from 'react';
import { Mail, RotateCw, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { SessionInvitationService } from '../../services/core/SessionInvitationService';

const KNOWN_ERRORS = new Set([
  'INVITE_INVALID_EMAIL', 'INVITE_SELF', 'ALREADY_INVITED', 'NO_SEATS_LEFT', 'INVITATION_LIMIT',
  'RESEND_LIMIT', 'RESEND_TOO_SOON', 'INVITATION_NOT_PENDING', 'SESSION_NOT_ACTIVE', 'SESSION_STARTED',
  'RATE_LIMITED', 'FORBIDDEN',
]);

const STATUS_CHIP = {
  Pending: 'bg-[var(--calico-warning-soft)] text-[var(--calico-warning-text)]',
  Declined: 'bg-gray-100 text-gray-600',
  Revoked: 'bg-gray-100 text-gray-600',
  unsent: 'bg-[var(--calico-danger-soft)] text-[var(--calico-danger-strong)]',
};

export default function GroupSessionPanel({ session, isTutor = false, userId = null, onChanged }) {
  const { t } = useI18n();
  const uid = useId();
  const [data, setData] = useState(null); // { seats, canManage, invitations }
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(null); // 'invite' | `resend:<id>` | `revoke:<id>`
  const [message, setMessage] = useState(null); // { tone: 'error' | 'success', text }

  const [version, setVersion] = useState(0); // bumped to read the seats again

  const sessionId = session?.id;

  useEffect(() => {
    if (!sessionId) return undefined;
    let active = true;
    SessionInvitationService.listForSession(sessionId).then((res) => {
      if (active && res.success) setData(res);
    });
    return () => { active = false; };
  }, [sessionId, version]);

  const reload = () => setVersion((v) => v + 1);

  const errorText = (code) => t(`groupSession.errors.${KNOWN_ERRORS.has(code) ? code : 'GENERIC'}`);

  const run = async (key, action, successKey) => {
    setBusy(key);
    setMessage(null);
    const res = await action();
    setBusy(null);
    if (res.success) {
      setMessage({ tone: 'success', text: t(successKey(res)) });
      onChanged?.();
    } else {
      setMessage({ tone: 'error', text: errorText(res.code) });
    }
    // Either way the seats may have moved (a refusal usually means they did).
    reload();
    return res;
  };

  const invite = async (e) => {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    const res = await run(
      'invite',
      () => SessionInvitationService.invite(sessionId, address),
      (r) => (r.emailSent ? 'groupSession.invited' : 'groupSession.invitedNotSent'),
    );
    if (res.success) setEmail('');
  };

  const participants = session?.participants || [];
  const organizerId = session?.organizerId ?? participants[0]?.studentId ?? null;
  const seats = data?.seats ?? { total: session?.maxCapacity ?? participants.length, taken: participants.length, pending: 0, free: 0 };
  const canManage = Boolean(data?.canManage);
  // Accepted invitations are already in the list of people above.
  const openInvitations = (data?.invitations || []).filter((i) => i.status !== 'Accepted');

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5" aria-hidden="true" />
        {t('groupSession.title')}
      </h3>

      <p className="text-sm text-gray-900 font-semibold">
        {t('groupSession.seats', { taken: seats.taken, total: seats.total })}
      </p>
      {seats.pending > 0 && (
        <p className="text-sm text-gray-600">{t('groupSession.pending', { count: seats.pending })}</p>
      )}
      {canManage && seats.free > 0 && (
        <p className="text-sm text-gray-600">{t('groupSession.free', { count: seats.free })}</p>
      )}

      {/* The tutor reads the students (with their email) in the card above. */}
      {!isTutor && (
        <ul className="mt-3 space-y-1.5">
          {participants.map((p) => (
            <li key={p.studentId} className="flex items-center gap-2 text-sm text-gray-800 min-w-0">
              <span className="truncate">{p.student?.name || t('groupSession.student')}</span>
              {p.studentId === userId && (
                <span className="text-xs text-gray-500 shrink-0">{t('groupSession.you')}</span>
              )}
              {p.studentId === organizerId && (
                <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-[var(--calico-orange-soft)] text-[var(--calico-orange-text)] shrink-0">
                  {t('groupSession.organizer')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {openInvitations.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 mb-2">{t('groupSession.invitations')}</p>
          <ul className="space-y-2">
            {openInvitations.map((inv) => {
              const chip = inv.status === 'Pending' && !inv.emailSent ? 'unsent' : inv.status;
              return (
                <li key={inv.id} className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-gray-800 break-all min-w-0 flex-1">{inv.email}</span>
                  <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${STATUS_CHIP[chip] || STATUS_CHIP.Declined}`}>
                    {t(`groupSession.status.${chip}`)}
                  </span>
                  {canManage && inv.status === 'Pending' && (
                    <span className="flex items-center gap-1">
                      {inv.canResend && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={Boolean(busy)}
                          onClick={() => run(
                            `resend:${inv.id}`,
                            () => SessionInvitationService.resend(sessionId, inv.id),
                            () => 'groupSession.resent',
                          )}
                        >
                          <RotateCw aria-hidden="true" />
                          {busy === `resend:${inv.id}` ? t('groupSession.resending') : t('groupSession.resend')}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={Boolean(busy)}
                        aria-label={t('groupSession.revokeLabel', { email: inv.email })}
                        onClick={() => run(
                          `revoke:${inv.id}`,
                          () => SessionInvitationService.revoke(sessionId, inv.id),
                          () => 'groupSession.revoked',
                        )}
                      >
                        <X aria-hidden="true" />
                        {t('groupSession.revoke')}
                      </Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {canManage && seats.free > 0 && (
        <form onSubmit={invite} className="mt-4 pt-4 border-t border-gray-100">
          <label htmlFor={`${uid}-email`} className="block text-xs font-semibold text-gray-500 mb-2">
            {t('groupSession.inviteLabel')}
          </label>
          <div className="flex gap-2 flex-wrap">
            <input
              id={`${uid}-email`}
              type="email"
              inputMode="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('groupSession.invitePlaceholder')}
              disabled={Boolean(busy)}
              className="flex-1 min-w-0 rounded-[var(--control-radius)] border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[var(--calico-orange-soft)] focus:border-[var(--calico-orange)] disabled:opacity-50"
            />
            <Button type="submit" variant="cta" disabled={Boolean(busy) || !email.trim()}>
              <Mail aria-hidden="true" />
              {busy === 'invite' ? t('groupSession.inviting') : t('groupSession.invite')}
            </Button>
          </div>
        </form>
      )}

      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`mt-3 text-sm ${message.tone === 'error' ? 'text-[var(--calico-danger-strong)]' : 'text-[var(--calico-green-success-dark)]'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
