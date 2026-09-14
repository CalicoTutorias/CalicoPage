'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useI18n } from '../../../lib/i18n';
import './ProfilePictureViewer.css';

/**
 * Lightbox for a profile picture. Rendered through a portal on <body> so it is
 * never clipped by a card with `overflow: hidden` or `transform`. Escape and a
 * click on the backdrop close it; body scroll is locked while open.
 */
export function ProfilePictureLightbox({ src, alt, onClose }) {
  const { t } = useI18n();

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

  if (!src || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="pp-lightbox__overlay"
      role="presentation"
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="pp-lightbox__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={alt || t('common.profilePicture.title')}
      >
        <button
          type="button"
          className="pp-lightbox__close"
          onClick={onClose}
          aria-label={t('common.profilePicture.close')}
        >
          <X />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="pp-lightbox__image" src={src} alt={alt || ''} />
      </div>
    </div>,
    document.body,
  );
}

/**
 * Wraps an avatar so clicking it opens the picture full size.
 *
 * - When there is no `src` (initials fallback) the children render untouched.
 * - Click/keyboard events are stopped so a parent card or <Link> does not
 *   navigate when the user only wanted to see the photo.
 * - Pass `as="span"` when the avatar lives inside an <a>/<button>, where a
 *   nested <button> would be invalid HTML.
 */
export default function ProfilePictureViewer({ src, alt, as = 'button', className = '', children }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  if (!src) return children;

  const openViewer = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };

  const label = t('common.profilePicture.view');
  const classes = `pp-viewer__trigger ${className}`.trim();

  const trigger = as === 'span' ? (
    <span
      role="button"
      tabIndex={0}
      className={classes}
      aria-label={label}
      title={label}
      onClick={openViewer}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') openViewer(e);
        else e.stopPropagation();
      }}
    >
      {children}
    </span>
  ) : (
    <button
      type="button"
      className={classes}
      aria-label={label}
      title={label}
      onClick={openViewer}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {children}
    </button>
  );

  return (
    <>
      {trigger}
      {open && <ProfilePictureLightbox src={src} alt={alt} onClose={close} />}
    </>
  );
}
