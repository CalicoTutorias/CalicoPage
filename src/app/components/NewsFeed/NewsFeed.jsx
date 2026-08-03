"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Megaphone } from 'lucide-react';
import { NewsService } from '../../services/core/NewsService';
import { useI18n } from '../../../lib/i18n';
import routes from '../../../routes';
import NewsCard from './NewsCard';
import NewsReaderModal from './NewsReaderModal';
import styles from './NewsFeed.module.css';

/**
 * Compact news/announcements widget for the student and tutor homes.
 *
 * Deliberately NOT on the landing page: the landing is a conversion surface and
 * a news block there both breaks its narrative and adds an exit point. Public
 * access to the same content lives at /noticias.
 *
 * The posts scroll horizontally (scroll-snap) instead of stacking, so the
 * widget keeps a fixed vertical footprint no matter how many posts exist —
 * on mobile as well as desktop. The full archive is one click away.
 *
 * Renders nothing while loading and nothing when there are no published posts,
 * so a host page never shows an empty section.
 *
 * @param {number} limit  Max posts in the carousel (default 6).
 */
export default function NewsFeed({ limit = 6 }) {
  const { t, formatDate } = useI18n();
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [openPost, setOpenPost] = useState(null);

  const trackRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    let cancelled = false;
    NewsService.getPublishedNews({ limit }).then((result) => {
      if (cancelled) return;
      setPosts(result.posts);
      setTotal(result.total);
    });
    return () => { cancelled = true; };
  }, [limit]);

  // Arrow affordances only make sense while there is somewhere to scroll.
  const syncArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft < maxScroll - 8);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    syncArrows();
    el.addEventListener('scroll', syncArrows, { passive: true });
    if (typeof ResizeObserver === 'undefined') {
      return () => el.removeEventListener('scroll', syncArrows);
    }
    const observer = new ResizeObserver(syncArrows);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', syncArrows);
      observer.disconnect();
    };
  }, [posts, syncArrows]);

  const scrollByPage = (direction) => {
    const el = trackRef.current;
    if (!el) return;
    // ~90% of the viewport keeps a sliver of the previous card visible, which
    // signals the list continues.
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: 'smooth' });
  };

  const closeModal = useCallback(() => setOpenPost(null), []);

  if (!posts.length) return null;

  return (
    <section className={styles.section} aria-label={t('news.sectionTitle')}>
      <div className={styles.header}>
        <span className={styles.headerIcon} aria-hidden="true">
          <Megaphone />
        </span>
        <h2 className={styles.heading}>{t('news.sectionTitle')}</h2>

        <div className={styles.headerActions}>
          {(canScrollLeft || canScrollRight) && (
            <div className={styles.arrows}>
              <button
                type="button"
                className={styles.arrow}
                onClick={() => scrollByPage(-1)}
                disabled={!canScrollLeft}
                aria-label={t('news.previous')}
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.arrow}
                onClick={() => scrollByPage(1)}
                disabled={!canScrollRight}
                aria-label={t('news.next')}
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          )}
          <Link href={routes.NEWS} className={styles.viewAll}>
            {total > posts.length
              ? t('news.viewAllCount', { count: total })
              : t('news.viewAll')}
          </Link>
        </div>
      </div>

      <div className={styles.track} ref={trackRef} tabIndex={0} role="list">
        {posts.map((post) => (
          <div className={styles.trackItem} key={post.id} role="listitem">
            <NewsCard
              post={post}
              t={t}
              formatDate={formatDate}
              onOpen={() => setOpenPost(post)}
            />
          </div>
        ))}
      </div>

      {openPost && (
        <NewsReaderModal
          post={openPost}
          t={t}
          formatDate={formatDate}
          onClose={closeModal}
        />
      )}
    </section>
  );
}
