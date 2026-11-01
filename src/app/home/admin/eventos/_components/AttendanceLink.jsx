'use client';

import { useRef, useState } from 'react';
import { Check, Copy, Link2, Link2Off } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminEventService } from '@/app/services/core/AdminEventService';
import { useI18n } from '@/lib/i18n';
import routes from '@/routes';
import ConfirmDialog from './ConfirmDialog';
import { ERROR_BOX, INPUT, LABEL, MUTED, errorKey } from './ui';

/**
 * Private link of a free event that already took place. Whoever opens it signs
 * in, becomes a registrant and can answer the survey, which is how the attendee
 * list of an event held without prior sign-ups gets built.
 */
export default function AttendanceLink({ event, onChange }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null); // i18n key
  const [confirmClose, setConfirmClose] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState(false);
  const linkRef = useRef(null);

  const path = event.attendanceCode
    ? routes.EVENT_DETAIL(event.slug, { asistencia: event.attendanceCode })
    : null;
  const url = path && typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;

  const run = async (call) => {
    setBusy(true);
    setError(null);
    const res = await call(event.id);
    setBusy(false);
    if (!res.success) {
      setError(errorKey(res, 'admin.events.attendance.error'));
      return false;
    }
    await onChange();
    return true;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyFallback(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      linkRef.current?.focus();
      linkRef.current?.select();
      setCopyFallback(true);
    }
  };

  const close = async () => {
    if (await run((id) => AdminEventService.closeAttendanceLink(id))) setConfirmClose(false);
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="admin-event-attendance-link" className={LABEL}>{t('admin.events.attendance.label')}</label>
      {url ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="admin-event-attendance-link"
            ref={linkRef}
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
            className={`${INPUT} font-mono text-xs`}
          />
          <Button variant="outline" onClick={copy} className="shrink-0">
            {copied ? <Check /> : <Copy />}
            {copied ? t('admin.events.detail.copied') : t('admin.events.detail.copyLink')}
          </Button>
          <Button variant="outline" onClick={() => setConfirmClose(true)} className="shrink-0">
            <Link2Off />
            {t('admin.events.attendance.close')}
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          disabled={busy}
          className="self-start"
          onClick={() => run((id) => AdminEventService.openAttendanceLink(id))}
        >
          <Link2 />
          {busy ? t('admin.events.actions.working') : t('admin.events.attendance.open')}
        </Button>
      )}
      <p className={`text-xs ${MUTED}`}>{t('admin.events.attendance.hint')}</p>
      {copyFallback && <p className={`text-xs ${MUTED}`}>{t('admin.events.detail.copyFallback')}</p>}
      {error && !confirmClose && <p role="alert" className={ERROR_BOX}>{t(error)}</p>}

      <ConfirmDialog
        open={confirmClose}
        title={t('admin.events.attendance.closeConfirm.title')}
        message={t('admin.events.attendance.closeConfirm.body')}
        confirmLabel={t('admin.events.attendance.closeConfirm.confirm')}
        destructive
        busy={busy}
        error={error ? t(error) : null}
        onConfirm={close}
        onCancel={() => { setConfirmClose(false); setError(null); }}
      />
    </div>
  );
}
