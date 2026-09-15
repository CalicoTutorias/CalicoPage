'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Images, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarketingPostService } from '../../../services/core/MarketingPostService';
import { useI18n } from '../../../../lib/i18n';
import routes from '../../../../routes';

/**
 * Library of Instagram posts published from the content-creator tool.
 * Posts are created locally (never here) — this page is for reviewing and
 * downloading them, typically from a phone right before uploading to Instagram.
 */
export default function AdminPostsPage() {
  const { t, formatDateTime } = useI18n();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State is only set inside the promise callback (never synchronously in the effect).
  const fetchPosts = useCallback(() => MarketingPostService.listPosts().then(({ success, posts: items }) => {
    if (success) {
      setPosts(items);
      setError(null);
    } else {
      setError(t('admin.posts.errors.load'));
    }
    setLoading(false);
  }), [t]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const refresh = () => {
    setLoading(true);
    fetchPosts();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">{t('admin.posts.title')}</h2>
          <p className="text-xs text-gray-500">{t('admin.posts.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" className="self-start sm:self-auto" onClick={refresh} disabled={loading}>
          <RefreshCw />
          {t('admin.posts.actions.refresh')}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">{t('common.loading')}</p>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-gray-500">
          <Images className="w-8 h-8 text-gray-300" />
          <p className="text-sm">{t('admin.posts.empty')}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link
                href={routes.ADMIN_POST_DETAIL(post.slug)}
                className="group flex flex-col h-full bg-white border border-gray-200 rounded-2xl overflow-hidden hover:border-orange-300 hover:shadow-sm transition"
              >
                <div className="relative bg-gray-100">
                  <img
                    src={post.cover.url}
                    alt=""
                    loading="lazy"
                    width={post.cover.width}
                    height={post.cover.height}
                    className="w-full h-auto object-cover"
                    style={{ aspectRatio: `${post.cover.width} / ${post.cover.height}` }}
                  />
                  {post.slideCount > 1 && (
                    <span className="absolute top-2 right-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/60 text-white">
                      {t('admin.posts.slides', { count: post.slideCount })}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1 p-3">
                  <span className="self-start text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                    {t(`admin.posts.formats.${post.format}`)}
                  </span>
                  <h3 className="text-sm font-semibold text-gray-800 line-clamp-2">{post.title}</h3>
                  {(post.publishedAt || post.createdAt) && (
                    <p className="text-xs text-gray-500">
                      {formatDateTime(post.publishedAt || post.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
