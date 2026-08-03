"use client";

import { useEffect } from 'react';
import { X } from 'lucide-react';
import MarkdownContent from './MarkdownContent';
import styles from './NewsFeed.module.css';

/**
 * Full-post reader. Escape closes it and body scroll is locked while open, so
 * the card surfaces can stay clamped without hiding content from anyone.
 */
export default function NewsReaderModal({ post, t, formatDate, onClose }) {
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

  if (!post) return null;

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={post.title}
      >
        <button
          type="button"
          className={styles.modalClose}
          onClick={onClose}
          aria-label={t('news.close')}
        >
          <X />
        </button>
        {post.imageUrl && (
          <img className={styles.modalImage} src={post.imageUrl} alt={post.title} />
        )}
        <div className={styles.modalBody}>
          <h3 className={styles.modalTitle}>{post.title}</h3>
          {post.publishedAt && (
            <p className={styles.date}>{formatDate(post.publishedAt)}</p>
          )}
          <MarkdownContent content={post.content} />
        </div>
      </div>
    </div>
  );
}
