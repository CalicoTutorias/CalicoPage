'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Check, Copy, Download, Share2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarketingPostService } from '../../../../services/core/MarketingPostService';
import { useI18n } from '../../../../../lib/i18n';
import routes from '../../../../../routes';

/** Trigger a browser download for a File without leaving the page. */
function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Post detail: preview every slide in order, save them to the phone and copy
 * the caption. A presentation (`post.document`) downloads as a single PDF; the
 * slide PNGs are only previews. A video reel (`post.video`) plays from its
 * presigned URL and downloads as the MP4 plus its cover PNG.
 *
 * The downloadable files are fetched as Files as soon as the page loads, so the
 * share button can call `navigator.share` synchronously inside the tap — Safari
 * drops the user-activation if we await a network request first.
 */
export default function AdminPostDetailPage() {
  const { slug } = useParams();
  const router = useRouter();
  const { t, formatDateTime } = useI18n();

  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [files, setFiles] = useState(null); // downloadable Files (slides in order, the PDF, or MP4 + cover), once ready
  const [filesError, setFilesError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const canShareFiles = typeof navigator !== 'undefined'
    && typeof navigator.canShare === 'function'
    && files?.length > 0
    && navigator.canShare({ files });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await MarketingPostService.getPost(slug);
      if (cancelled) return;
      if (!result.success) {
        setError(result.status === 404 ? t('admin.posts.errors.notFound') : t('admin.posts.errors.load'));
        setLoading(false);
        return;
      }
      setPost(result.post);
      setLoading(false);

      let names = result.post.files.map((f) => f.name);
      if (result.post.document) names = [result.post.document.name];
      if (result.post.video) names = [result.post.video.name, result.post.files[0].name];
      const fetched = await Promise.all(names.map((name) => MarketingPostService.fetchFile(slug, name)));
      if (cancelled) return;
      if (fetched.some((f) => !f)) setFilesError(true);
      else setFiles(fetched);
    })();
    return () => { cancelled = true; };
  }, [slug, t]);

  const share = async () => {
    try {
      await navigator.share({ files, title: post.title });
    } catch (err) {
      // AbortError = the user closed the share sheet; nothing to report.
      if (err?.name !== 'AbortError') setError(t('admin.posts.errors.share'));
    }
  };

  const downloadAll = async () => {
    setBusy(true);
    for (const file of files) {
      downloadFile(file);
      // Browsers throttle bursts of downloads; a short gap keeps the order.
      await wait(350);
    }
    setBusy(false);
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(post.caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t('admin.posts.errors.copy'));
    }
  };

  const remove = async () => {
    if (!window.confirm(t('admin.posts.actions.confirmDelete', { title: post.title }))) return;
    setBusy(true);
    const { success, error: deleteError } = await MarketingPostService.deletePost(slug);
    if (success) {
      router.replace(routes.ADMIN_POSTS);
      return;
    }
    setError(deleteError || t('admin.posts.errors.delete'));
    setBusy(false);
  };

  const backLink = (
    <Link href={routes.ADMIN_POSTS} className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-orange-600 self-start">
      <ArrowLeft className="w-4 h-4" />
      {t('admin.posts.back')}
    </Link>
  );

  if (loading) {
    return <p className="text-sm text-gray-500">{t('common.loading')}</p>;
  }

  if (!post) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</p>
      </div>
    );
  }

  const filesReady = Boolean(files);
  const isDocument = Boolean(post.document);
  const isVideo = Boolean(post.video);

  let downloadLabel = t(isVideo ? 'admin.posts.preparingVideo' : 'admin.posts.preparing');
  if (filesReady) {
    if (isVideo) downloadLabel = t('admin.posts.actions.downloadVideo');
    else if (isDocument) downloadLabel = t('admin.posts.actions.downloadPdf', { count: post.document.pages });
    else downloadLabel = t('admin.posts.actions.downloadAll', { count: post.files.length });
  }
  let shareLabel = t('admin.posts.actions.share');
  if (isVideo) shareLabel = t('admin.posts.actions.shareVideo');
  else if (isDocument) shareLabel = t('admin.posts.actions.sharePdf');
  let hint = t('admin.posts.orderHint');
  if (isVideo) hint = t('admin.posts.videoHint');
  else if (isDocument) hint = t('admin.posts.documentHint');

  return (
    <div className="flex flex-col gap-5">
      {backLink}

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
            {t(`admin.posts.formats.${post.format}`)}
          </span>
          <span className="text-xs text-gray-500">
            {isVideo
              ? t('admin.posts.video', { seconds: Math.round(post.video.duration) })
              : t(isDocument ? 'admin.posts.pages' : 'admin.posts.slides', { count: post.files.length })}
          </span>
        </div>
        <h2 className="text-lg font-bold text-gray-800">{post.title}</h2>
        {(post.publishedAt || post.createdAt) && (
          <p className="text-xs text-gray-500">
            {formatDateTime(post.publishedAt || post.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</p>
      )}

      {/* Primary actions: phone first */}
      <div className="flex flex-col sm:flex-row gap-2">
        {canShareFiles && (
          <Button variant="cta" size="xl" onClick={share} disabled={busy}>
            <Share2 />
            {shareLabel}
          </Button>
        )}
        <Button
          variant={canShareFiles ? 'outline' : 'cta'}
          size="xl"
          onClick={downloadAll}
          disabled={!filesReady || busy}
        >
          <Download />
          {downloadLabel}
        </Button>
      </div>
      {filesError && (
        <p className="text-xs text-red-600">{t('admin.posts.errors.files')}</p>
      )}
      <p className="text-[11px] text-gray-400">{hint}</p>

      {/* Video reel: the MP4 plays straight from S3 (presigned URL, supports seeking) */}
      {isVideo && (
        <video
          controls
          playsInline
          preload="metadata"
          src={post.video.url}
          poster={post.files[0].url}
          className="w-full max-w-sm rounded-xl border border-gray-200 bg-black"
          style={{ aspectRatio: `${post.video.width} / ${post.video.height}` }}
        />
      )}

      {/* Slides */}
      <ol className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {post.files.map((f, i) => (
          <li key={f.name} className="flex flex-col gap-2">
            <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
              <img
                src={f.url}
                alt={t('admin.posts.slideAlt', { n: i + 1 })}
                loading="lazy"
                width={f.width}
                height={f.height}
                className="w-full h-auto"
                style={{ aspectRatio: `${f.width} / ${f.height}` }}
              />
              <span className="absolute top-2 left-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/60 text-white">
                {isVideo ? t('admin.posts.cover') : `${i + 1}/${post.files.length}`}
              </span>
            </div>
            {!isDocument && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadFile(files[isVideo ? 1 : i])}
                disabled={!filesReady}
              >
                <Download />
                {t('admin.posts.actions.download')}
              </Button>
            )}
          </li>
        ))}
      </ol>

      {/* Caption */}
      {post.caption && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-gray-800">{t('admin.posts.caption')}</h3>
            <Button variant="outline" size="sm" onClick={copyCaption}>
              {copied ? <Check /> : <Copy />}
              {copied ? t('admin.posts.actions.copied') : t('admin.posts.actions.copy')}
            </Button>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{post.caption}</p>
        </div>
      )}

      <div className="border-t border-gray-100 pt-4">
        <Button variant="destructive" size="sm" onClick={remove} disabled={busy}>
          <Trash2 />
          {t('admin.posts.actions.delete')}
        </Button>
      </div>
    </div>
  );
}
