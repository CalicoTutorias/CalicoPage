"use client";

import { useEffect, useRef, useState } from 'react';
import { Megaphone, Pin } from 'lucide-react';
import MarkdownContent from './MarkdownContent';
import styles from './NewsFeed.module.css';

/**
 * A single news post as a card. Shared by the home carousel and the /noticias
 * grid so both surfaces stay visually identical.
 *
 * The body is clamped by CSS; "read more" only appears when the clamp actually
 * cuts content off (or when there's an image the card only shows cropped).
 *
 * @param {object} post        Public post shape (id, title, content, imageUrl…)
 * @param {Function} onOpen    Opens the reader modal.
 */
export default function NewsCard({ post, t, formatDate, onOpen }) {
  const bodyRef = useRef(null);
  const [clamped, setClamped] = useState(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return undefined;

    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();

    // Card width changes with the carousel/grid breakpoints, which changes how
    // much text fits — re-measure instead of trusting the first paint.
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [post.content]);

  const showReadMore = clamped || Boolean(post.imageUrl);

  return (
    <article className={styles.card}>
      {/* Every card gets a header block — a real image when the post has one,
          a branded placeholder otherwise. Without it, image-less cards left a
          dead gap next to their illustrated neighbours (cards stretch to a
          common height in both the carousel and the grid). */}
      {post.imageUrl ? (
        <div className={styles.cardImageWrap}>
          <img
            className={styles.cardImage}
            src={post.imageUrl}
            alt={post.title}
            loading="lazy"
          />
        </div>
      ) : (
        <div className={`${styles.cardImageWrap} ${styles.cardImageFallback}`} aria-hidden="true">
          <Megaphone />
        </div>
      )}
      <div className={styles.cardBody}>
        <div className={styles.cardMeta}>
          {post.isPinned && (
            <span className={styles.pin}>
              <Pin aria-hidden="true" />
              {t('news.pinned')}
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
        {showReadMore && (
          <button
            type="button"
            className={styles.readMore}
            onClick={onOpen}
            aria-label={`${t('news.readMore')}: ${post.title}`}
          >
            {t('news.readMore')}
          </button>
        )}
      </div>
    </article>
  );
}
