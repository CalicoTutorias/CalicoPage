"use client";

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '../../../lib/i18n';
import styles from './events.module.css';

/**
 * Base dialog for the events surfaces (same mechanics as NewsReaderModal):
 * Escape and an overlay click close it, body scroll is locked while open, and
 * focus moves into the dialog and back to the trigger on close. Centered on
 * desktop, a bottom sheet on phones.
 *
 * `title` renders the header heading; pass `labelledBy` instead when the
 * children render their own heading (e.g. a success state).
 */
export default function EventModal({ title, onClose, children, labelledBy }) {
  const { t } = useI18n();
  const titleId = useId();
  const dialogRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
  }, []);

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || (title ? titleId : undefined)}
        tabIndex={-1}
      >
        <div className={styles.modalHeader}>
          {title && <h2 id={titleId} className={styles.modalTitle}>{title}</h2>}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={styles.modalClose}
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <div className={styles.modalBody}>{children}</div>
      </div>
    </div>
  );
}
