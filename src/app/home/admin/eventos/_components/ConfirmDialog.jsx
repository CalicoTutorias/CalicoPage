'use client';

import { useEffect, useId, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '../../../../../lib/i18n';

/**
 * Hand-rolled confirmation modal (role="alertdialog"). Used instead of
 * window.confirm, which browser QA automation cannot answer. Escape or the
 * backdrop cancels (unless `busy`); focus starts on the safe "go back" button.
 * `children` adds extra content between the message and the buttons (e.g. a
 * reason field).
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  busy = false,
  error = null,
  onConfirm,
  onCancel,
  children,
}) {
  const { t } = useI18n();
  const titleId = useId();
  const messageId = useId();
  const cancelRef = useRef(null);
  // Latest callback/busy for the Escape listener, which is bound once per
  // opening so re-renders (e.g. typing a reason) don't steal the focus.
  const latest = useRef({ onCancel, busy });
  useEffect(() => {
    latest.current = { onCancel, busy };
  });

  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !latest.current.busy) latest.current.onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-[var(--modal-backdrop)] p-4"
      onClick={() => { if (!busy) onCancel(); }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        className="w-full max-w-[var(--modal-max-width)] bg-white rounded-[var(--modal-radius)] shadow-[var(--elev-modal)] p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-base font-bold text-[var(--calico-ink)]">{title}</h2>
        {message && <div id={messageId} className="text-sm text-[var(--calico-slate-700)] flex flex-col gap-2">{message}</div>}
        {children}
        {error && (
          <p role="alert" className="text-sm text-[var(--calico-danger-strong)] bg-[var(--calico-danger-soft)] rounded-[var(--radius-lg)] px-3 py-2">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button ref={cancelRef} variant="outline" onClick={onCancel} disabled={busy}>
            {cancelLabel || t('admin.events.actions.back')}
          </Button>
          <Button variant={destructive ? 'destructive' : 'cta'} onClick={onConfirm} disabled={busy}>
            {busy ? t('admin.events.actions.working') : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
