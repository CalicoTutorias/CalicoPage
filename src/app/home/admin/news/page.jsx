'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Megaphone, Pin, Plus, Trash2, Pencil, Eye, EyeOff, ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewsService } from '../../../services/core/NewsService';
import { useI18n } from '../../../../lib/i18n';
import MarkdownContent from '../../../components/NewsFeed/MarkdownContent';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB — mirrors the API schema.

const EMPTY_FORM = { title: '', content: '', isPublished: false, isPinned: false };

export default function AdminNewsPage() {
  const { t, formatDateTime } = useI18n();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(null);
  // null = closed · 'new' = creating · post object = editing
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setListError(null);
    const { success, posts: items } = await NewsService.listAllNews({ limit: 100 });
    if (!success) {
      setListError(t('admin.news.errors.load'));
    } else {
      setPosts(items);
    }
    setLoading(false);
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const togglePublish = async (post) => {
    const { success, error } = await NewsService.updateNews(post.id, {
      isPublished: !post.isPublished,
    });
    if (!success) setListError(error || t('admin.news.errors.save'));
    await load();
  };

  const removePost = async (post) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(t('admin.news.actions.confirmDelete', { title: post.title }))) return;
    const { success, error } = await NewsService.deleteNews(post.id);
    if (!success) setListError(error || t('admin.news.errors.delete'));
    await load();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">{t('admin.news.title')}</h2>
          <p className="text-xs text-gray-500">{t('admin.news.subtitle')}</p>
        </div>
        {!editing && (
          <Button variant="cta" onClick={() => setEditing('new')}>
            <Plus />
            {t('admin.news.newPost')}
          </Button>
        )}
      </div>

      {listError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
          {listError}
        </p>
      )}

      {editing && (
        <NewsEditor
          post={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}

      {loading ? (
        <p className="text-sm text-gray-500">{t('common.loading')}</p>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-gray-500">
          <Megaphone className="w-8 h-8 text-gray-300" />
          <p className="text-sm">{t('admin.news.empty')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {posts.map((post) => (
            <li
              key={post.id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 bg-white border border-gray-200 rounded-2xl p-4"
            >
              {post.imageUrl ? (
                <img
                  src={post.imageUrl}
                  alt=""
                  className="w-full sm:w-24 h-32 sm:h-16 object-cover rounded-xl bg-gray-100 flex-shrink-0"
                />
              ) : (
                <div className="hidden sm:flex w-24 h-16 items-center justify-center rounded-xl bg-gray-50 text-gray-300 flex-shrink-0">
                  <Megaphone className="w-5 h-5" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {post.isPinned && <Pin className="w-3.5 h-3.5 text-orange-500" aria-label={t('news.pinned')} />}
                  <h3 className="font-semibold text-gray-800 truncate">{post.title}</h3>
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      post.isPublished
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {post.isPublished ? t('admin.news.status.published') : t('admin.news.status.draft')}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {post.publishedAt
                    ? formatDateTime(post.publishedAt, { dateStyle: 'medium', timeStyle: 'short' })
                    : formatDateTime(post.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                  {post.author?.name ? ` · ${post.author.name}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <Button variant="outline" size="sm" onClick={() => togglePublish(post)}>
                  {post.isPublished ? <EyeOff /> : <Eye />}
                  {post.isPublished ? t('admin.news.actions.unpublish') : t('admin.news.actions.publish')}
                </Button>
                <Button variant="outline" size="icon-sm" aria-label={t('admin.news.actions.edit')} onClick={() => setEditing(post)}>
                  <Pencil />
                </Button>
                <Button variant="destructive" size="icon-sm" aria-label={t('admin.news.actions.delete')} onClick={() => removePost(post)}>
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Create/edit form with a live Markdown preview (same renderer as the public
 * feed, so preview === published output) and direct-to-S3 image upload.
 */
function NewsEditor({ post, onClose, onSaved }) {
  const { t } = useI18n();
  const isNew = !post;
  const [form, setForm] = useState(
    isNew
      ? EMPTY_FORM
      : {
          title: post.title,
          content: post.content,
          isPublished: post.isPublished,
          isPinned: post.isPinned,
        },
  );
  const [tab, setTab] = useState('write');
  // Image state: keep the existing URL, a pending new file, or a removal flag.
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(post?.imageUrl || null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Revoke the blob preview URL when it changes or on unmount.
  useEffect(() => {
    if (!imageFile || !imagePreview) return undefined;
    return () => URL.revokeObjectURL(imagePreview);
  }, [imageFile, imagePreview]);

  const pickImage = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError(t('admin.news.errors.imageType'));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(t('admin.news.errors.imageSize'));
      return;
    }
    setError(null);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageRemoved(false);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setImageRemoved(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setError(t('admin.news.errors.required'));
      return;
    }
    setSaving(true);
    setError(null);

    let imageS3Key; // undefined = untouched
    if (imageFile) {
      const upload = await NewsService.uploadNewsImage(imageFile);
      if (!upload.success) {
        setError(upload.error || t('admin.news.errors.image'));
        setSaving(false);
        return;
      }
      imageS3Key = upload.s3Key;
    } else if (imageRemoved && post?.imageUrl) {
      imageS3Key = null;
    }

    const payload = {
      title: form.title,
      content: form.content,
      isPublished: form.isPublished,
      isPinned: form.isPinned,
      ...(imageS3Key !== undefined ? { imageS3Key } : {}),
    };

    const result = isNew
      ? await NewsService.createNews(payload)
      : await NewsService.updateNews(post.id, payload);

    if (!result.success) {
      setError(result.error || t('admin.news.errors.save'));
      setSaving(false);
      return;
    }
    await onSaved();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-800">
          {isNew ? t('admin.news.createTitle') : t('admin.news.editTitle')}
        </h3>
        <Button variant="ghost" size="icon-sm" aria-label={t('admin.news.actions.cancel')} onClick={onClose}>
          <X />
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
          {error}
        </p>
      )}

      <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
        {t('admin.news.fields.title')}
        <input
          type="text"
          maxLength={200}
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder={t('admin.news.fields.titlePlaceholder')}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800"
        />
      </label>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">{t('admin.news.fields.content')}</span>
          <div className="flex gap-1">
            <Button
              variant={tab === 'write' ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={tab === 'write'}
              onClick={() => setTab('write')}
            >
              {t('admin.news.tabs.write')}
            </Button>
            <Button
              variant={tab === 'preview' ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={tab === 'preview'}
              onClick={() => setTab('preview')}
            >
              {t('admin.news.tabs.preview')}
            </Button>
          </div>
        </div>

        {tab === 'write' ? (
          <textarea
            rows={10}
            maxLength={20000}
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            placeholder={t('admin.news.fields.contentPlaceholder')}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 font-mono resize-y"
          />
        ) : (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 min-h-[16rem]">
            {form.content.trim() ? (
              <MarkdownContent content={form.content} />
            ) : (
              <p className="text-sm text-gray-400">{t('admin.news.previewEmpty')}</p>
            )}
          </div>
        )}
        <p className="text-[11px] text-gray-400">{t('admin.news.markdownHint')}</p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-gray-600">{t('admin.news.fields.image')}</span>
        {imagePreview ? (
          <div className="flex items-start gap-3">
            <img
              src={imagePreview}
              alt=""
              className="w-48 max-h-32 object-contain rounded-xl border border-gray-200 bg-gray-50"
            />
            <div className="flex flex-col gap-2">
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <ImagePlus />
                {t('admin.news.image.replace')}
              </Button>
              <Button variant="outline" size="sm" onClick={removeImage}>
                <Trash2 />
                {t('admin.news.image.remove')}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="self-start" onClick={() => fileInputRef.current?.click()}>
            <ImagePlus />
            {t('admin.news.image.select')}
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_MIME_TYPES.join(',')}
          onChange={pickImage}
          className="hidden"
        />
        <p className="text-[11px] text-gray-400">{t('admin.news.image.hint')}</p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-gray-100 pt-4">
        <div className="flex items-center gap-5">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isPublished}
              onChange={(e) => setForm((f) => ({ ...f, isPublished: e.target.checked }))}
              className="w-4 h-4 accent-[var(--calico-orange)]"
            />
            {t('admin.news.flags.publish')}
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isPinned}
              onChange={(e) => setForm((f) => ({ ...f, isPinned: e.target.checked }))}
              className="w-4 h-4 accent-[var(--calico-orange)]"
            />
            {t('admin.news.flags.pin')}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t('admin.news.actions.cancel')}
          </Button>
          <Button variant="cta" onClick={save} disabled={saving}>
            {saving ? t('admin.news.actions.saving') : t('admin.news.actions.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
