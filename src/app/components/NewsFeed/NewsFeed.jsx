"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Megaphone, Pin, X } from 'lucide-react';
import { NewsService } from '../../services/core/NewsService';
import { useI18n } from '../../../lib/i18n';
import MarkdownContent from './MarkdownContent';
import styles from './NewsFeed.module.css';

/**
 * Public news/announcements feed.
 *
 * Mounted on the landing page (anonymous visitors) and on the student and
 * tutor homes (logged-in users). Renders nothing while loading and nothing
 * at all when there are no published posts, so pages never show an empty
 * section.
 *
 * @param {'landing'|'app'} variant  Visual context: 'landing' adds section
 *                                   padding/background; 'app' is flush so the
 *                                   host page controls spacing.
 * @param {number} limit             Max posts to show (default 3).
 */
export default function NewsFeed({ variant = 'app', limit = 3 }) {
  const { t, formatDate } = useI18n();
  const [posts, setPosts] = useState([]);
  const [openPost, setOpenPost] = useState(null);

  useEffect(() => {
    let cancelled = false;
    NewsService.getPublishedNews(limit).then((items) => {
      if (!cancelled) setPosts(items);
    });
    return () => { cancelled = true; };
  }, [limit]);

  const closeModal = useCallback(() => setOpenPost(null), []);

  // Escape closes the reader modal; lock body scroll while it's open.
  useEffect(() => {
    if (!openPost) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [openPost, closeModal]);

  if (!posts.length) return null;

  return (
    <section
      className={`${styles.section} ${variant === 'landing' ? styles.landing : ''}`}
      aria-label={t('news.sectionTitle')}
    >
      <div className={styles.inner}>
        <div className={styles.header}>
          <span className={styles.headerIcon} aria-hidden="true">
            <Megaphone />
          </span>
          <h2 className={styles.heading}>{t('news.sectionTitle')}</h2>
        </div>

        <div className={styles.grid}>
          {posts.map((post) => (
            <NewsCard
              key={post.id}
              post={post}
              t={t}
              formatDate={formatDate}
              onOpen={() => setOpenPost(post)}
            />
          ))}
        </div>
      </div>

      {openPost && (
        <div
          className={styles.overlay}
          role="presentation"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label={openPost.title}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={closeModal}
              aria-label={t('news.close')}
            >
              <X />
            </button>
            {openPost.imageUrl && (
              <img
                className={styles.modalImage}
                src={openPost.imageUrl}
                alt={openPost.title}
              />
            )}
            <div className={styles.modalBody}>
              <h3 className={styles.modalTitle}>{openPost.title}</h3>
              {openPost.publishedAt && (
                <p className={styles.date}>{formatDate(openPost.publishedAt)}</p>
              )}
              <MarkdownContent content={openPost.content} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function NewsCard({ post, t, formatDate, onOpen }) {
  const bodyRef = useRef(null);
  const [clamped, setClamped] = useState(false);

  // Show "read more" only when the clamped body actually overflows.
  useEffect(() => {
    const el = bodyRef.current;
    if (el) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [post.content]);

  return (
    <article className={styles.card}>
      {post.imageUrl && (
        <div className={styles.cardImageWrap}>
          <img
            className={styles.cardImage}
            src={post.imageUrl}
            alt={post.title}
            loading="lazy"
          />
        </div>
      )}
      <div className={styles.cardBody}>
        <div className={styles.cardMeta}>
          {post.isPinned && (
            <span className={styles.pin} title={t('news.pinned')}>
              <Pin aria-hidden="true" />
            </span>
          )}
          {post.publishedAt && (
            <span className={styles.date}>{formatDate(post.publishedAt)}</span>
          )}
        </div>
        <h3 className={styles.cardTitle}>{post.title}</h3>
        <div ref={bodyRef} className={styles.cardContent}>
          <MarkdownContent content={post.content} />
        </div>
        {clamped && (
          <button type="button" className={styles.readMore} onClick={onOpen}>
            {t('news.readMore')}
          </button>
        )}
      </div>
    </article>
  );
}
