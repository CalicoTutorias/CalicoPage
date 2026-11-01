'use client';

import { CreditCard, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { CHIP, TONE } from './ui';

/**
 * How an event is paid, for the admin list and detail:
 *  - approval event (requiresApproval) → manual: paid by transfer, each
 *    registration approved by an admin;
 *  - paid event → Wompi: charged online at registration through the same
 *    checkout as a tutoring session, confirmed on its own;
 *  - free event → nothing to show.
 */
export default function PaymentModeChip({ event }) {
  const { t } = useI18n();
  if (event.requiresApproval) {
    return (
      <span className={`${CHIP} ${TONE.info} gap-1`} title={t('admin.events.detail.approvalHint')}>
        <ShieldCheck className="w-3 h-3" aria-hidden="true" />
        {t('admin.events.detail.approvalChip')}
      </span>
    );
  }
  if (Number(event.price) > 0) {
    return (
      <span className={`${CHIP} ${TONE.success} gap-1`} title={t('admin.events.detail.wompiHint')}>
        <CreditCard className="w-3 h-3" aria-hidden="true" />
        {t('admin.events.detail.wompiChip')}
      </span>
    );
  }
  return null;
}
