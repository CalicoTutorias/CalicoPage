"use client";

import { useId, useState } from 'react';
import { AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '../../../lib/i18n';
import { EventService } from '../../services/core/EventService';
import EventModal from './EventModal';
import styles from './events.module.css';

// Same refund options as the tutoring cancellation (CancellationModal and
// /api/sessions/[id]/cancel), which the event cancel-registration API mirrors.
export const REFUND_METHODS = ['llave', 'nequi', 'use_future_session'];
const DETAILS_MAX = 200;

/**
 * Cancel a Confirmed registration:
 *  - refundable (paid, ≥ 6 h before start): refund method + details required;
 *  - paid but < 6 h: allowed, with a "no automatic refund" warning;
 *  - free: a plain confirm.
 * Calls onCanceled({ refundable }) after the API accepts it.
 */
export default function CancelRegistrationModal({ event, myRegistration, onClose, onCanceled }) {
  const { t, formatCurrency } = useI18n();
  const methodId = useId();
  const detailsId = useId();

  const refundable = !!myRegistration?.refundable;
  const amount = Number(myRegistration?.finalAmount ?? event?.price ?? 0);
  const isPaid = amount > 0;

  const [method, setMethod] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const canConfirm = !submitting && (!refundable || (method !== '' && details.trim() !== ''));

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    const res = await EventService.cancelRegistration(
      event.slug,
      refundable ? { refundMethod: method, refundMethodDetails: details.trim() } : {},
    );
    if (res.success) {
      onCanceled({ refundable: !!res.refundable });
      return;
    }
    setSubmitting(false);
    const code = res.code || res.error;
    if (code === 'RATE_LIMITED' || res.status === 429) {
      setError(t('events.register.errors.RATE_LIMITED'));
    } else if (code === 'REFUND_DETAILS_REQUIRED' || code === 'NOT_REGISTERED') {
      setError(t(`events.cancel.errors.${code}`));
    } else {
      setError(t('events.cancel.errors.generic'));
    }
  };

  return (
    <EventModal title={t('events.cancel.title')} onClose={onClose}>
      <div className={styles.stack}>
        <p className={styles.lead}>{t('events.cancel.question', { title: event.title })}</p>

        {refundable && (
          <>
            <p className={`${styles.message} ${styles.messageInfo}`}>
              {t('events.cancel.refundable', { amount: formatCurrency(amount) })}
            </p>
            <div className={styles.field}>
              <label htmlFor={methodId} className={styles.fieldLabel}>
                {t('events.cancel.methodLabel')}
              </label>
              <select
                id={methodId}
                className={styles.select}
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                disabled={submitting}
              >
                <option value="">{t('events.cancel.methodPlaceholder')}</option>
                {REFUND_METHODS.map((value) => (
                  <option key={value} value={value}>
                    {t(`events.cancel.methods.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor={detailsId} className={styles.fieldLabel}>
                {t('events.cancel.detailsLabel')}
              </label>
              <Input
                id={detailsId}
                className={styles.input}
                value={details}
                maxLength={DETAILS_MAX}
                placeholder={t('events.cancel.detailsPlaceholder')}
                onChange={(e) => setDetails(e.target.value)}
                disabled={submitting}
              />
            </div>
          </>
        )}

        {!refundable && isPaid && (
          <p className={`${styles.message} ${styles.messageWarning}`}>
            <AlertTriangle aria-hidden="true" />
            {t('events.cancel.noRefund')}
          </p>
        )}

        {!isPaid && <p className={styles.note}>{t('events.cancel.free')}</p>}

        {error && (
          <p className={`${styles.message} ${styles.messageError}`} role="alert">
            <AlertCircle aria-hidden="true" />
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={submitting}>
            {t('events.cancel.keep')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="lg"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {submitting && <Loader2 aria-hidden="true" className={styles.spin} />}
            {submitting ? t('events.cancel.processing') : t('events.cancel.confirm')}
          </Button>
        </div>
      </div>
    </EventModal>
  );
}
