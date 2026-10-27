"use client";

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  AlertCircle, CalendarDays, CheckCircle2, Clock, Info, Loader2, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '../../context/SecureAuthContext';
import { useI18n } from '../../../lib/i18n';
import { hasPhone } from '../../../lib/utils/profile';
import { DEFAULT_PHONE_COUNTRY_CODE, PHONE_COUNTRY_CODES, joinPhone } from '../../../lib/utils/phone';
import { PHONE_MAX_DIGITS, isValidPhoneLocal, sanitizePhoneDigits } from '../../../lib/utils/validation';
import { UserService } from '../../services/core/UserService';
import { formatEventDate, formatEventTimeRange } from '../../../lib/utils/event-format';
import { EventService } from '../../services/core/EventService';
import {
  createWompiWidget, loadWompiScript, openWompiCheckout,
} from '../../services/utils/wompiCheckout';
import EventModal from './EventModal';
import EventPriceTag from './EventPriceTag';
import styles from './events.module.css';

const POLL_INTERVAL_MS = 3000;
const POLL_ATTEMPTS = 10; // 3 s × 10 = 30 s
const WOMPI_WAIT_MS = 8000;
const KNOWN_ERRORS = ['EVENT_NOT_OPEN', 'EVENT_TUTOR', 'RATE_LIMITED', 'REGISTRATION_REJECTED'];

/** Resolve once Wompi's widget.js has defined window.WidgetCheckout (or give up). */
function waitForWompi() {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      if (window.WidgetCheckout) return resolve(true);
      if (Date.now() - started >= WOMPI_WAIT_MS) return resolve(false);
      setTimeout(check, 100);
    };
    check();
  });
}

/**
 * Confirmation step before registering. Never registers silently: it shows the
 * summary and the marketing opt-in (unchecked by default), then
 *  - approval event (requiresApproval) → EventService.register sends a
 *    request (PendingApproval); the price is paid by transfer, never Wompi.
 *    The team arranges it by phone, so a profile without one is asked for it
 *    here (saved to the profile first; the API refuses with PHONE_REQUIRED);
 *  - free → EventService.register;
 *  - paid → startCheckout → Wompi widget → confirm-payment. If confirm-payment
 *    fails after an APPROVED result, or Wompi reports PENDING (PSE / Nequi),
 *    it polls the event until the webhook has confirmed the registration
 *    (up to 30 s) and never invites a second payment.
 *
 * Phases: confirm · working (API call) · paying (Wompi open) · confirming
 *         (polling) · slow (polling gave up) · success. Not dismissible while
 *         working or confirming.
 */
export default function RegisterConfirmModal({ event, source, onClose, onRegistered }) {
  const { t, locale, formatCurrency } = useI18n();
  const { user, setUserField } = useAuth();
  const successId = useId();
  const phoneId = useId();
  const approval = Boolean(event.requiresApproval);
  // "Paid" = charged through Wompi here; an approval event is paid by transfer.
  const isPaid = !approval && Number(event.price) > 0;
  const earlyBird = isPaid && event.earlyBird?.remaining > 0 ? event.earlyBird : null;
  const displayPrice = earlyBird ? earlyBird.discountedPrice : Number(event.price);

  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [phase, setPhase] = useState('confirm');
  const [requested, setRequested] = useState(false); // the result is a pending request, not a spot
  // Asked once, only on approval events, only when the profile has no phone.
  const [askPhone, setAskPhone] = useState(() => approval && !hasPhone(user));
  const [phoneCode, setPhoneCode] = useState(DEFAULT_PHONE_COUNTRY_CODE);
  const [phoneLocal, setPhoneLocal] = useState('');
  const [message, setMessage] = useState(null); // { tone: 'error'|'info', text }
  const mounted = useRef(false);
  const pollTimer = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(pollTimer.current);
    };
  }, []);

  // Start fetching widget.js while the person reads the summary.
  useEffect(() => {
    if (isPaid) loadWompiScript();
  }, [isPaid]);

  // Not dismissible while an API call is in flight or while a paid
  // registration is being confirmed (polling).
  const busy = phase === 'working' || phase === 'confirming';
  const guardedClose = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  const succeed = () => {
    setMessage(null);
    setPhase('success');
    onRegistered();
  };

  const fail = (res) => {
    const code = res?.code || res?.error;
    if (code === 'ALREADY_REGISTERED') {
      // Already in: just refresh the page into its "registered" state.
      onClose();
      return;
    }
    if (code === 'PHONE_REQUIRED') {
      setAskPhone(true);
      setPhase('confirm');
      setMessage({ tone: 'error', text: t('events.register.errors.PHONE_REQUIRED') });
      return;
    }
    const key = KNOWN_ERRORS.includes(code) ? code : res?.status === 429 ? 'RATE_LIMITED' : 'generic';
    setPhase('confirm');
    setMessage({ tone: 'error', text: t(`events.register.errors.${key}`) });
  };

  // Poll the event until the webhook has confirmed the registration; after
  // 30 s, show `slowKey` and let the person close.
  const pollUntilConfirmed = (slowKey, attempt = 1) => {
    pollTimer.current = setTimeout(async () => {
      const res = await EventService.getBySlug(event.slug);
      if (!mounted.current) return;
      if (res.success && res.myRegistration?.status === 'Confirmed') {
        succeed();
      } else if (attempt >= POLL_ATTEMPTS) {
        setPhase('slow');
        setMessage({ tone: 'info', text: t(slowKey) });
      } else {
        pollUntilConfirmed(slowKey, attempt + 1);
      }
    }, POLL_INTERVAL_MS);
  };

  const startConfirming = (messageKey, slowKey) => {
    setPhase('confirming');
    setMessage({ tone: 'info', text: t(messageKey) });
    pollUntilConfirmed(slowKey);
  };

  const handleWompiResult = async (result, checkout) => {
    if (!mounted.current) return;
    if (!result) {
      setPhase('confirm');
      setMessage({ tone: 'info', text: t('events.register.paymentClosed') });
      return;
    }
    const status = result.transaction?.status;
    if (status === 'APPROVED') {
      setPhase('working');
      setMessage(null);
      const res = await EventService.confirmPayment({
        reference: checkout.reference,
        transactionId: result.transaction.id,
      });
      if (!mounted.current) return;
      if (res.success) {
        succeed();
        return;
      }
      // The webhook may land first: keep checking instead of reporting a failure.
      startConfirming('events.register.paymentProcessing', 'events.register.paymentProcessingSlow');
      return;
    }
    if (status === 'PENDING') {
      // PSE / Nequi settle later and the webhook fulfils the registration, so
      // there is nothing to confirm here — and never invite a second charge.
      startConfirming('events.register.paymentPending', 'events.register.paymentPendingSlow');
      return;
    }
    setPhase('confirm');
    setMessage({
      tone: 'error',
      text: t(status === 'DECLINED' ? 'events.register.paymentDeclined' : 'events.register.paymentError'),
    });
  };

  /** Save the typed phone on the profile. @returns {Promise<boolean>} */
  const savePhone = async () => {
    if (!isValidPhoneLocal(phoneLocal)) {
      setMessage({ tone: 'error', text: t('events.register.errors.phoneInvalid') });
      return false;
    }
    setPhase('working');
    const fullPhone = joinPhone(phoneCode, phoneLocal);
    const res = await UserService.updateUser(user?.uid, { phoneNumber: fullPhone });
    if (!mounted.current) return false;
    if (!res.success) {
      setPhase('confirm');
      setMessage({ tone: 'error', text: t('events.register.errors.phoneSaveFailed') });
      return false;
    }
    setUserField?.('phone', fullPhone);
    setAskPhone(false);
    return true;
  };

  const handleConfirm = async () => {
    setMessage(null);
    if (askPhone && !(await savePhone())) return;
    setPhase('working');

    if (!isPaid) {
      const res = await EventService.register(event.slug, { source, marketingOptIn });
      if (!mounted.current) return;
      if (res.success) {
        setRequested(res.registration?.status === 'PendingApproval');
        succeed();
      } else {
        fail(res);
      }
      return;
    }

    const res = await EventService.startCheckout(event.slug, { source, marketingOptIn });
    if (!mounted.current) return;
    if (!res.success) {
      fail(res);
      return;
    }
    const { checkout } = res;
    loadWompiScript();
    const ready = await waitForWompi();
    if (!mounted.current) return;

    let widget;
    try {
      if (!ready) throw new Error('Wompi widget.js did not load');
      widget = createWompiWidget({ ...checkout, customer: checkout.customer });
    } catch {
      setPhase('confirm');
      setMessage({ tone: 'error', text: t('events.register.paymentError') });
      return;
    }
    setPhase('paying');
    openWompiCheckout(widget, (result) => handleWompiResult(result, checkout));
  };

  if (phase === 'success') {
    return (
      <EventModal onClose={onClose} labelledBy={successId}>
        <div className={styles.stack}>
          <div className={styles.result} role="status">
            <span className={styles.resultIcon} aria-hidden="true"><CheckCircle2 /></span>
            <h2 id={successId} className={styles.resultTitle}>
              {t(requested ? 'events.register.requestSentTitle' : 'events.register.successTitle')}
            </h2>
            <p className={styles.resultText}>
              {t(requested ? 'events.register.requestSentText' : 'events.register.successText')}
            </p>
          </div>
          <div className={styles.actions}>
            <Button type="button" variant="cta" size="lg" onClick={onClose}>
              {t('events.register.done')}
            </Button>
          </div>
        </div>
      </EventModal>
    );
  }

  const waiting = phase === 'paying' || phase === 'confirming';
  let primaryLabel = isPaid
    ? t('events.register.confirmPaid', { price: formatCurrency(displayPrice) })
    : t('events.register.confirmFree');
  if (approval) primaryLabel = t('events.register.confirmRequest');

  return (
    <EventModal title={t(approval ? 'events.register.titleRequest' : 'events.register.title')} onClose={guardedClose}>
      <div className={styles.stack}>
        <div className={styles.summary}>
          <p className={styles.summaryTitle}>{event.title}</p>
          <p className={styles.summaryRow}>
            <CalendarDays aria-hidden="true" />
            <span className={styles.capitalize}>{formatEventDate(event.startsAt, locale)}</span>
          </p>
          <p className={styles.summaryRow}>
            <Clock aria-hidden="true" />
            <span>
              {formatEventTimeRange(event.startsAt, event.endsAt, locale)}{' '}
              <span className={styles.muted}>({t('events.common.bogotaTime')})</span>
            </span>
          </p>
          <div className={styles.summaryPrice}>
            <span className={styles.summaryLabel}>{t('events.register.price')}</span>
            <EventPriceTag price={event.price} earlyBird={approval ? null : event.earlyBird} />
          </div>
          {approval && <p className={styles.note}>{t('events.register.approvalNote')}</p>}
          {earlyBird && (
            <p className={styles.note}>
              {t('events.register.earlyBirdNote', { percent: earlyBird.percent })}
            </p>
          )}
        </div>

        {askPhone && (
          <div className={styles.field}>
            <label htmlFor={phoneId} className={styles.fieldLabel}>{t('events.register.phoneLabel')}</label>
            <div className={styles.phoneRow}>
              <select
                className={`${styles.select} ${styles.phoneCode}`}
                value={phoneCode}
                onChange={(e) => setPhoneCode(e.target.value)}
                aria-label={t('events.register.phoneCodeLabel')}
                disabled={phase !== 'confirm'}
              >
                {PHONE_COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code} title={c.label}>{c.code}</option>
                ))}
              </select>
              <Input
                id={phoneId}
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                className={styles.input}
                value={phoneLocal}
                maxLength={PHONE_MAX_DIGITS}
                placeholder={t('events.register.phonePlaceholder')}
                onChange={(e) => setPhoneLocal(sanitizePhoneDigits(e.target.value).slice(0, PHONE_MAX_DIGITS))}
                disabled={phase !== 'confirm'}
              />
            </div>
            <p className={styles.note}>{t('events.register.phoneHelp')}</p>
          </div>
        )}

        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={marketingOptIn}
            onChange={(e) => setMarketingOptIn(e.target.checked)}
            disabled={phase !== 'confirm'}
          />
          <span>{t('events.register.marketingOptIn')}</span>
        </label>

        {phase === 'paying' && (
          <p className={`${styles.message} ${styles.messageInfo}`} role="status">
            <Loader2 aria-hidden="true" className={styles.spin} />
            {t('events.register.paying')}
          </p>
        )}

        {message && (
          <p
            className={`${styles.message} ${message.tone === 'error' ? styles.messageError : styles.messageInfo}`}
            role={message.tone === 'error' ? 'alert' : 'status'}
          >
            {phase === 'confirming' ? (
              <Loader2 aria-hidden="true" className={styles.spin} />
            ) : message.tone === 'error' ? (
              <AlertCircle aria-hidden="true" />
            ) : (
              <Info aria-hidden="true" />
            )}
            {message.text}
          </p>
        )}

        {isPaid && phase === 'confirm' && (
          <p className={styles.secureNote}>
            <ShieldCheck aria-hidden="true" />
            {t('events.register.secureNote')}
          </p>
        )}

        <div className={styles.actions}>
          {phase === 'slow' ? (
            <Button type="button" variant="cta" size="lg" onClick={onClose}>
              {t('events.register.done')}
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={busy}>
                {t('events.register.notNow')}
              </Button>
              <Button
                type="button"
                variant="cta"
                size="lg"
                onClick={handleConfirm}
                disabled={phase !== 'confirm' || (askPhone && phoneLocal === '')}
              >
                {(busy || waiting) && <Loader2 aria-hidden="true" className={styles.spin} />}
                {busy || waiting ? t('events.register.processing') : primaryLabel}
              </Button>
            </>
          )}
        </div>
      </div>
    </EventModal>
  );
}
