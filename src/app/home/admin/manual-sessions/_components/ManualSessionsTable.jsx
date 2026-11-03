'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAX_PROOF_FILE_SIZE, PROOF_ACCEPT, PROOF_TYPES } from '@/lib/payments/manual-payment-proof';
import { AdminService } from '../../../../services/core/AdminService';
import { useI18n } from '../../../../../lib/i18n';
import { CARD, CHIP, ERROR_BOX, HINT, INK, MUTED, TABLE_WRAP, TD, TH, TONE, TR } from '../../eventos/_components/ui';
import { errorKey } from './errors';

const PAGE_SIZE = 20;
const CLOSED_STATUSES = new Set(['Canceled', 'Rejected']);

const PAYMENT_TONE = {
  pending: TONE.warning,
  paid: TONE.success,
  failed: TONE.danger,
};

/**
 * Every manual session, because the student pays once it is over: this is where
 * the admin comes back to upload the screenshot of the payment, which marks it
 * as paid. `refreshToken` changes when the form registers a new one.
 */
export default function ManualSessionsTable({ refreshToken }) {
  const { t, formatCurrency, formatDate, formatDateTime } = useI18n();

  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [{ status, sessions, total, res }, setList] = useState({ status: 'loading', sessions: [], total: 0 });

  const [uploadingId, setUploadingId] = useState(null);
  const [rowError, setRowError] = useState(null);
  const fileInput = useRef(null);
  const uploadTarget = useRef(null);

  useEffect(() => {
    let active = true;
    AdminService.listManualSessions({ limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((result) => {
        if (!active) return;
        setList(result?.success
          ? { status: 'ready', sessions: result.sessions, total: result.total }
          : { status: 'error', sessions: [], total: 0, res: result });
      })
      .catch(() => {
        if (active) setList({ status: 'error', sessions: [], total: 0 });
      });
    return () => { active = false; };
  }, [page, reload, refreshToken]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const time = (d) => formatDateTime(d, { hour: 'numeric', minute: '2-digit' });

  const replaceRow = (updated) => {
    setList((current) => ({
      ...current,
      sessions: current.sessions.map((s) => (s.id === updated.id ? updated : s)),
    }));
  };

  const pickProof = (sessionId) => {
    uploadTarget.current = sessionId;
    setRowError(null);
    fileInput.current?.click();
  };

  const uploadProof = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // so choosing the same file again fires `change`
    const sessionId = uploadTarget.current;
    if (!file || !sessionId) return;

    const fail = (key) => setRowError({ id: sessionId, message: t(key) });
    if (!PROOF_TYPES[file.type]) return fail('admin.manualSessions.errors.PROOF_INVALID_TYPE');
    if (file.size > MAX_PROOF_FILE_SIZE) return fail('admin.manualSessions.errors.PROOF_TOO_LARGE');

    setUploadingId(sessionId);
    try {
      const result = await AdminService.uploadManualPaymentProof(sessionId, file);
      if (result?.success) replaceRow(result.session);
      else fail(errorKey(result, 'admin.manualSessions.errors.upload'));
    } catch {
      fail('admin.manualSessions.errors.upload');
    } finally {
      setUploadingId(null);
    }
  };

  const viewProof = async (sessionId) => {
    setRowError(null);
    // Opened before the await: browsers block a pop-up that follows a network call.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const result = await AdminService.getManualPaymentProofUrl(sessionId);
      if (result?.success) {
        if (tab) tab.location.href = result.url;
        else window.location.assign(result.url);
        return;
      }
      tab?.close();
      setRowError({ id: sessionId, message: t(errorKey(result, 'admin.manualSessions.errors.viewProof')) });
    } catch {
      tab?.close();
      setRowError({ id: sessionId, message: t('admin.manualSessions.errors.viewProof') });
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="manual-sessions-list-title">
      <div>
        <h3 id="manual-sessions-list-title" className={`text-base font-bold ${INK}`}>{t('admin.manualSessions.list.title')}</h3>
        <p className={HINT}>{t('admin.manualSessions.list.subtitle')}</p>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={PROOF_ACCEPT}
        onChange={uploadProof}
        className="hidden"
        aria-label={t('admin.manualSessions.list.uploadProof')}
      />

      {status === 'loading' && (
        <p className={`${CARD} p-5 text-sm ${MUTED}`}>{t('common.loading')}</p>
      )}

      {status === 'error' && (
        <div className={`${ERROR_BOX} flex items-center justify-between gap-2 flex-wrap`}>
          {t(errorKey(res, 'admin.manualSessions.errors.loadList'))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setList({ status: 'loading', sessions: [], total: 0 });
              setReload((n) => n + 1);
            }}
          >
            {t('admin.manualSessions.retry')}
          </Button>
        </div>
      )}

      {status === 'ready' && sessions.length === 0 && (
        <p className={`${CARD} p-5 text-sm ${MUTED}`}>{t('admin.manualSessions.list.empty')}</p>
      )}

      {status === 'ready' && sessions.length > 0 && (
        <div className={TABLE_WRAP}>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={TH}>{t('admin.manualSessions.list.columns.date')}</th>
                <th className={TH}>{t('admin.manualSessions.list.columns.course')}</th>
                <th className={TH}>{t('admin.manualSessions.list.columns.tutor')}</th>
                <th className={TH}>{t('admin.manualSessions.list.columns.student')}</th>
                <th className={TH}>{t('admin.manualSessions.list.columns.amount')}</th>
                <th className={TH}>{t('admin.manualSessions.list.columns.payment')}</th>
                <th className={TH}>{t('admin.manualSessions.list.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const closed = CLOSED_STATUSES.has(s.status);
                const pending = s.payment?.status === 'pending';
                return (
                  <tr key={s.id} className={TR}>
                    <td className={`${TD} whitespace-nowrap ${INK}`}>
                      <div>{formatDate(s.startTimestamp, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
                      <div className={`text-xs ${MUTED}`}>{time(s.startTimestamp)} – {time(s.endTimestamp)}</div>
                      {closed && (
                        <span className={`${CHIP} ${TONE.danger} mt-1`}>{t('admin.manualSessions.list.canceled')}</span>
                      )}
                      {s.status === 'Completed' && (
                        <span className={`${CHIP} ${TONE.success} mt-1`}>{t('admin.manualSessions.list.completed')}</span>
                      )}
                    </td>
                    <td className={`${TD} ${INK}`}>
                      <div>{s.course?.name}</div>
                      <div className={`text-xs font-mono ${MUTED}`}>{s.course?.code}</div>
                    </td>
                    <td className={`${TD} ${INK}`}>{s.tutor?.name}</td>
                    <td className={`${TD} ${INK}`}>
                      <div>{s.student?.name}</div>
                      {s.student?.phoneNumber && <div className={`text-xs whitespace-nowrap ${MUTED}`}>{s.student.phoneNumber}</div>}
                      {s.student?.email && <div className={`text-xs whitespace-nowrap ${MUTED}`}>{s.student.email}</div>}
                    </td>
                    <td className={`${TD} whitespace-nowrap ${INK}`}>
                      {s.payment ? formatCurrency(s.payment.amount, 'COP') : '—'}
                    </td>
                    <td className={TD}>
                      {s.payment && (
                        <span className={`${CHIP} ${PAYMENT_TONE[s.payment.status] ?? TONE.neutral}`}>
                          {t(`admin.manualSessions.payment.${s.payment.status}`)}
                        </span>
                      )}
                    </td>
                    <td className={TD}>
                      <div className="flex flex-col items-start gap-1">
                        {pending && !closed && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={uploadingId !== null}
                            aria-label={t('admin.manualSessions.list.uploadProofFor', { course: s.course?.name ?? '' })}
                            onClick={() => pickProof(s.id)}
                          >
                            {uploadingId === s.id ? <Loader2 className="animate-spin" /> : <Upload />}
                            {t(uploadingId === s.id ? 'admin.manualSessions.list.uploading' : 'admin.manualSessions.list.uploadProof')}
                          </Button>
                        )}
                        {s.payment?.hasProof && (
                          <Button size="sm" variant="ghost" onClick={() => viewProof(s.id)}>
                            <Eye />
                            {t('admin.manualSessions.list.viewProof')}
                          </Button>
                        )}
                        {s.meetLink && !closed && (
                          <a
                            className="text-xs underline text-[var(--calico-ink)]"
                            href={s.meetLink}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t('admin.manualSessions.created.meetLink')}
                          </a>
                        )}
                        {rowError?.id === s.id && (
                          <p role="alert" className="text-xs font-medium text-[var(--calico-danger-strong)]">{rowError.message}</p>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {status === 'ready' && total > PAGE_SIZE && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className={`text-xs ${MUTED}`}>
            {t('admin.manualSessions.list.pagination.page', { page: page + 1, total: totalPages })}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label={t('admin.manualSessions.list.pagination.previous')}
            >
              <ChevronLeft />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label={t('admin.manualSessions.list.pagination.next')}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
