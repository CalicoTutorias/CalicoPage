"use client";

/**
 * Public news/announcements archive.
 *
 * Reachable without login (linked from the landing footer) and from the
 * student/tutor home carousel via "view all". Kept off the landing itself on
 * purpose: the landing is a conversion surface, so the news live here and the
 * landing only points at them.
 *
 * Pagination is explicit ("load more", 9 at a time) rather than rendering the
 * whole archive, so the page never turns into an endless wall of cards.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Megaphone } from 'lucide-react';
import { NewsService } from '../services/core/NewsService';
import { useAuth } from '../context/SecureAuthContext';
import { useI18n } from '../../lib/i18n';
import routes from '../../routes';
import NewsCard from '../components/NewsFeed/NewsCard';
import NewsReaderModal from '../components/NewsFeed/NewsReaderModal';
import LocaleSwitcher from '../components/LocaleSwitcher';
import Logo from '../../../public/CalicoLogo.png';
import feedStyles from '../components/NewsFeed/NewsFeed.module.css';
import styles from './noticias.module.css';

const PAGE_SIZE = 9;

export default function NoticiasPage() {
  const { t, formatDate } = useI18n();
  const { user } = useAuth();

  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openPost, setOpenPost] = useState(null);

  useEffect(() => {
    let cancelled = false;
    NewsService.getPublishedNews({ limit: PAGE_SIZE, offset: 0 }).then((result) => {
      if (cancelled) return;
      setPosts(result.posts);
      setTotal(result.total);
      setHasMore(result.hasMore);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    const result = await NewsService.getPublishedNews({
      limit: PAGE_SIZE,
      offset: posts.length,
    });
    // Dedupe by id: a post published between two page requests would otherwise
    // shift the offset window and duplicate a card.
    setPosts((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...result.posts.filter((p) => !seen.has(p.id))];
    });
    setTotal(result.total);
    setHasMore(result.hasMore);
    setLoadingMore(false);
  };

  const closeModal = useCallback(() => setOpenPost(null), []);

  const backHref = user?.isLoggedIn ? routes.HOME : routes.LANDING;
  const backLabel = user?.isLoggedIn ? t('news.backToHome') : t('news.backToLanding');

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href={backHref} className={styles.back}>
            <ArrowLeft aria-hidden="true" />
            <span>{backLabel}</span>
          </Link>
          <Link href={routes.LANDING} className={styles.brand} aria-label="Calico">
            <Image src={Logo} alt="Calico" width={104} height={34} priority />
          </Link>
          <LocaleSwitcher />
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.hero}>
          <span className={styles.heroIcon} aria-hidden="true">
            <Megaphone />
          </span>
          <h1 className={styles.title}>{t('news.pageTitle')}</h1>
          <p className={styles.subtitle}>{t('news.pageSubtitle')}</p>
        </div>

        {loading && (
          <div className={feedStyles.grid} aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={styles.skeleton} />
            ))}
          </div>
        )}

        {!loading && posts.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>{t('news.emptyTitle')}</p>
            <p className={styles.emptyText}>{t('news.emptyText')}</p>
          </div>
        )}

        {posts.length > 0 && (
          <>
            <div className={feedStyles.grid}>
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

            <div className={styles.footerArea}>
              <p className={styles.count}>
                {t('news.showingCount', { shown: posts.length, total })}
              </p>
              {hasMore && (
                <button
                  type="button"
                  className={styles.loadMore}
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? t('news.loading') : t('news.loadMore')}
                </button>
              )}
            </div>
          </>
        )}
      </main>

      {openPost && (
        <NewsReaderModal
          post={openPost}
          t={t}
          formatDate={formatDate}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
