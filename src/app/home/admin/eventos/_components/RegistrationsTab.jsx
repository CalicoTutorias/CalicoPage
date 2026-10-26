'use client';

import { useEffect, useState } from 'react';
import { Check, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminEventService } from '@/app/services/core/AdminEventService';
import { useI18n } from '@/lib/i18n';
import { formatEventDate } from '@/lib/utils/event-format';
import ConfirmDialog from './ConfirmDialog';
import {
  CHIP, ERROR_BOX, INK, MUTED, SUCCESS_BOX, TABLE_WRAP, TD, TH, TONE, TR, errorKey,
} from './ui';

const STATUS_TONE = {
  Confirmed: TONE.success,
  PendingPayment: TONE.warning,
  PendingApproval: TONE.warning,
  Rejected: TONE.danger,
  Canceled: TONE.neutral,
};

/** Which review actions a row offers on an approval event (mirrors the service transitions). */
const REVIEW_ACTIONS = {
  PendingApproval: ['approve', 'reject'],
  Confirmed: ['reject'],
  Rejected: ['approve'],
};

/**
 * Registrations of one event (every status) plus the CSV export. On an
 * approval event (`requiresApproval`) each row can be approved or rejected
 * while the event is Published (`canReview`); a rejection asks first.
 */
export default function RegistrationsTab({ eventId, slug, requiresApproval = false, canReview = false }) {
  const { t, formatCurrency, locale } = useI18n();
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState(null); // i18n key
  const [downloading, setDownloading] = useState(false);
  const [csvError, setCsvError] = useState(null); // i18n key

  const [reviewing, setReviewing] = useState(null); // registration id in flight
  const [notice, setNotice] = useState(null); // { tone, text }
  const [rejecting, setRejecting] = useState(null); // row awaiting the reject confirmation
  const [rejectError, setRejectError] = useState(null);

  useEffect(() => {
    let active = true;
    AdminEventService.registrations(eventId).then((res) => {
      if (!active) return;
      if (res.success) setRows(res.registrations || []);
      else setLoadError(errorKey(res, 'admin.events.registrations.load'));
    });
    return () => { active = false; };
  }, [eventId]);

  const downloadCsv = async () => {
    setDownloading(true);
    setCsvError(null);
    const res = await AdminEventService.downloadRegistrationsCsv(eventId, slug);
    setDownloading(false);
    if (!res.success) setCsvError(errorKey(res, 'admin.events.errors.csv'));
  };

  /** @returns {Promise<string|null>} an error text, or null on success */
  const review = async (row, decision) => {
    setReviewing(row.id);
    setNotice(null);
    const res = await AdminEventService.reviewRegistration(eventId, row.id, decision);
    setReviewing(null);
    const name = row.name || row.email;
    if (!res.success) {
      return res.code === 'INVALID_STATE'
        ? t('admin.events.errors.INVALID_STATE')
        : t(errorKey(res, 'admin.events.registrations.reviewError'));
    }
    setRows((list) => list.map((r) => (r.id === row.id ? res.registration : r)));
    let key = 'rejectedDone';
    if (decision === 'approve') key = res.emailSent ? 'approvedEmailSent' : 'approvedNoEmail';
    setNotice({ tone: 'success', text: t(`admin.events.registrations.${key}`, { name }) });
    return null;
  };

  const approve = async (row) => {
    const error = await review(row, 'approve');
    if (error) setNotice({ tone: 'error', text: error });
  };

  const confirmReject = async () => {
    setRejectError(null);
    const error = await review(rejecting, 'reject');
    if (error) setRejectError(error);
    else setRejecting(null);
  };

  if (loadError) return <p className={ERROR_BOX}>{t(loadError)}</p>;
  if (!rows) return <p className={`text-sm ${MUTED}`}>{t('common.loading')}</p>;

  const yesNo = (v) => (v ? t('admin.events.registrations.yes') : t('admin.events.registrations.no'));
  const count = (status) => rows.filter((r) => r.status === status).length;
  const showReview = requiresApproval && canReview;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {requiresApproval && (
          <p className={`text-sm ${INK} mr-auto`}>
            {t('admin.events.registrations.summary', {
              confirmed: count('Confirmed'),
              pending: count('PendingApproval'),
              rejected: count('Rejected'),
            })}
          </p>
        )}
        {csvError && <p className={`${ERROR_BOX} mr-auto`}>{t(csvError)}</p>}
        <Button variant="outline" size="sm" onClick={downloadCsv} disabled={downloading || rows.length === 0}>
          <Download />
          {t('admin.events.registrations.downloadCsv')}
        </Button>
      </div>

      {notice && (
        <p role="status" className={notice.tone === 'error' ? ERROR_BOX : SUCCESS_BOX}>{notice.text}</p>
      )}

      {rows.length === 0 ? (
        <p className={`text-sm ${MUTED}`}>{t('admin.events.registrations.empty')}</p>
      ) : (
        <div className={TABLE_WRAP}>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={TH}>{t('admin.events.registrations.columns.name')}</th>
                <th className={TH}>{t('admin.events.registrations.columns.phone')}</th>
                <th className={TH}>{t('admin.events.registrations.columns.career')}</th>
                <th className={TH}>{t('admin.events.registrations.columns.source')}</th>
                <th className={TH}>{t('admin.events.registrations.columns.status')}</th>
                {showReview && <th className={TH}>{t('admin.events.registrations.columns.actions')}</th>}
                {!requiresApproval && <th className={TH}>{t('admin.events.registrations.columns.earlyBird')}</th>}
                <th className={`${TH} text-right`}>{t('admin.events.registrations.columns.amount')}</th>
                <th className={TH}>{t('admin.events.registrations.columns.survey')}</th>
                <th className={TH}>{t('admin.events.registrations.columns.registeredAt')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const name = r.name || r.email;
                return (
                  <tr key={r.id} className={TR}>
                    <td className={TD}>
                      <p className={`font-medium ${INK}`}>{r.name || '—'}</p>
                      <p className={`text-xs ${MUTED}`}>{r.email}</p>
                    </td>
                    <td className={`${TD} whitespace-nowrap ${INK}`}>{r.phone || '—'}</td>
                    <td className={`${TD} ${INK}`}>{r.career || '—'}</td>
                    <td className={`${TD} font-mono text-xs ${MUTED}`}>{r.source || '—'}</td>
                    <td className={TD}>
                      <span className={`${CHIP} ${STATUS_TONE[r.status] || TONE.neutral}`}>
                        {t(`admin.events.registrations.status.${r.status}`)}
                      </span>
                      {r.status === 'Canceled' && r.refundMethod && (
                        <p className={`mt-1 text-xs ${MUTED} break-words`}>
                          {t('admin.events.registrations.refund', {
                            method: t(`events.cancel.methods.${r.refundMethod}`),
                            details: r.refundMethodDetails || '—',
                          })}
                        </p>
                      )}
                    </td>
                    {showReview && (
                      <td className={TD}>
                        <div className="flex flex-wrap gap-1.5">
                          {(REVIEW_ACTIONS[r.status] ?? []).map((decision) => (
                            <Button
                              key={decision}
                              size="sm"
                              variant={decision === 'approve' ? 'cta' : 'outline'}
                              disabled={reviewing !== null}
                              aria-label={t(`admin.events.registrations.${decision}Aria`, { name })}
                              onClick={() => {
                                if (decision === 'approve') {
                                  approve(r);
                                } else {
                                  setRejectError(null);
                                  setRejecting(r);
                                }
                              }}
                            >
                              {decision === 'approve' ? <Check /> : <X />}
                              {t(`admin.events.registrations.${decision}`)}
                            </Button>
                          ))}
                        </div>
                      </td>
                    )}
                    {!requiresApproval && (
                      <td className={TD}>
                        {r.earlyBird && <span className={`${CHIP} ${TONE.info}`}>{t('admin.events.registrations.earlyBird')}</span>}
                      </td>
                    )}
                    <td className={`${TD} text-right whitespace-nowrap ${INK}`}>
                      {Number(r.finalAmount) > 0 ? formatCurrency(r.finalAmount, 'COP') : t('admin.events.registrations.free')}
                    </td>
                    <td className={`${TD} ${INK}`}>{yesNo(r.surveyAnswered)}</td>
                    <td className={`${TD} whitespace-nowrap text-xs ${MUTED}`}>
                      {r.registeredAt ? formatEventDate(r.registeredAt, locale) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(rejecting)}
        title={t('admin.events.registrations.rejectTitle')}
        message={rejecting ? t('admin.events.registrations.rejectBody', { name: rejecting.name || rejecting.email }) : ''}
        confirmLabel={t('admin.events.registrations.rejectConfirm')}
        destructive
        busy={reviewing !== null}
        error={rejectError}
        onConfirm={confirmReject}
        onCancel={() => setRejecting(null)}
      />
    </div>
  );
}
