'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, FolderOpen, Link2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminEventService } from '@/app/services/core/AdminEventService';
import { MarketingPostService } from '@/app/services/core/MarketingPostService';
import { useI18n } from '@/lib/i18n';
import {
  MATERIAL_ACCEPT, MATERIAL_NAME_MAX, MAX_MATERIALS_PER_EVENT, MAX_MATERIAL_FILE_SIZE, materialContentType, normalizeMaterialUrl,
} from '@/lib/events/event-materials';
import { countKey, formatEventDate } from '@/lib/utils/event-format';
import ConfirmDialog from './ConfirmDialog';
import {
  CHIP, ERROR_BOX, HINT, INFO_BOX, INK, INPUT, LABEL, MUTED, SUCCESS_BOX, TABLE_WRAP, TD, TH, TONE, TR, errorKey,
} from './ui';

const MAX_MB = MAX_MATERIAL_FILE_SIZE / 1024 / 1024;
const UPLOAD_ERRORS = [
  'MATERIAL_TYPE_INVALID', 'MATERIAL_TOO_LARGE', 'MATERIAL_LIMIT', 'MATERIAL_DUPLICATE',
  'MATERIAL_LINK_NAME_REQUIRED', 'MATERIAL_URL_INVALID', 'UPLOAD_FAILED',
];
const EMPTY_LINK = { name: '', url: '' };

function formatSize(bytes, locale) {
  const fmt = (n) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 1 }).format(n);
  if (bytes >= 1024 * 1024) return `${fmt(bytes / 1024 / 1024)} MB`;
  return `${fmt(Math.max(1, bytes / 1024))} KB`;
}

/**
 * Study material of one event: upload (several files, one after the other:
 * presign → PUT to S3 → register), pick the PDF of a post, which is referenced
 * and not copied, or add an external link such as the recording; open and delete.
 * Students get it only once Confirmed and after answering the survey (enforced by
 * the API). Adding material needs a Published event (`canUpload`).
 */
export default function MaterialsTab({ eventId, canUpload }) {
  const { t, locale } = useI18n();
  const [materials, setMaterials] = useState(null);
  const [loadError, setLoadError] = useState(null); // i18n key
  const [progress, setProgress] = useState(null); // { current, total } while uploading
  const [result, setResult] = useState(null); // { uploaded, errors: string[] }
  const [deleting, setDeleting] = useState(null); // material awaiting the delete confirmation
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  // Post picker: null = closed. { posts: null } while they load.
  const [picker, setPicker] = useState(null); // { posts, slug }
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerError, setPickerError] = useState(null); // text
  // Link dialog: null = closed.
  const [link, setLink] = useState(null); // { name, url }
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState(null); // text
  const inputRef = useRef(null);

  const load = useCallback(
    () => AdminEventService.materials(eventId).then((res) => {
      if (res.success) {
        setMaterials(res.materials || []);
        setLoadError(null);
      } else {
        setLoadError(errorKey(res, 'admin.events.materials.load'));
      }
    }),
    [eventId],
  );

  useEffect(() => { load(); }, [load]);

  const uploadError = (code, name) => t(
    `admin.events.materials.errors.${UPLOAD_ERRORS.includes(code) ? code : 'generic'}`,
    { name, size: MAX_MB, max: MAX_MATERIALS_PER_EVENT },
  );

  const pickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    setResult(null);
    const errors = [];
    let uploaded = 0;
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      setProgress({ current: i + 1, total: files.length });
      if (!materialContentType(file.name)) {
        errors.push(uploadError('MATERIAL_TYPE_INVALID', file.name));
      } else if (file.size > MAX_MATERIAL_FILE_SIZE) {
        errors.push(uploadError('MATERIAL_TOO_LARGE', file.name));
      } else {
        const res = await AdminEventService.uploadMaterial(eventId, file);
        if (res.success) uploaded += 1;
        else errors.push(res.status === 429 ? t('admin.events.errors.RATE_LIMITED') : uploadError(res.rule || res.code, file.name));
      }
    }
    setProgress(null);
    setResult({ uploaded, errors });
    await load();
  };

  const openPicker = async () => {
    setResult(null);
    setPickerError(null);
    setPicker({ posts: null, slug: '' });
    const res = await MarketingPostService.listPosts();
    if (!res.success) {
      setPicker({ posts: [], slug: '' });
      setPickerError(t('admin.events.materials.fromPost.loadError'));
      return;
    }
    // Only presentations carry a PDF, and a file that is already here cannot be added twice.
    const used = new Set(materials.map((m) => m.postSlug).filter(Boolean));
    const posts = res.posts.filter((p) => p.hasDocument && !used.has(p.slug));
    setPicker({ posts, slug: posts[0]?.slug ?? '' });
  };

  const closePicker = () => {
    setPicker(null);
    setPickerError(null);
  };

  const attachPost = async () => {
    const post = picker.posts?.find((p) => p.slug === picker.slug);
    if (!post) {
      closePicker();
      return;
    }
    setPickerBusy(true);
    setPickerError(null);
    const res = await AdminEventService.attachPostMaterial(eventId, post.slug);
    setPickerBusy(false);
    if (!res.success) {
      setPickerError(res.status === 429 ? t('admin.events.errors.RATE_LIMITED') : uploadError(res.rule || res.code, post.title));
      return;
    }
    closePicker();
    setResult({ uploaded: 0, added: post.title, errors: [] });
    await load();
  };

  const openLinkDialog = () => {
    setResult(null);
    setLinkError(null);
    setLink(EMPTY_LINK);
  };

  const closeLinkDialog = () => {
    setLink(null);
    setLinkError(null);
  };

  const addLink = async () => {
    const name = link.name.trim();
    const missing = !name ? 'MATERIAL_LINK_NAME_REQUIRED' : !normalizeMaterialUrl(link.url) && 'MATERIAL_URL_INVALID';
    if (missing) {
      setLinkError(uploadError(missing, name));
      return;
    }
    setLinkBusy(true);
    setLinkError(null);
    const res = await AdminEventService.addMaterialLink(eventId, { name, url: link.url });
    setLinkBusy(false);
    if (!res.success) {
      setLinkError(res.status === 429 ? t('admin.events.errors.RATE_LIMITED') : uploadError(res.rule || res.code, name));
      return;
    }
    closeLinkDialog();
    setResult({ uploaded: 0, added: name, errors: [] });
    await load();
  };

  const confirmDelete = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    const res = await AdminEventService.deleteMaterial(eventId, deleting.id);
    setDeleteBusy(false);
    if (!res.success) {
      setDeleteError(t(errorKey(res, 'admin.events.materials.deleteError')));
      return;
    }
    setDeleting(null);
    setResult(null);
    await load();
  };

  if (loadError) return <p className={ERROR_BOX}>{t(loadError)}</p>;
  if (!materials) return <p className={`text-sm ${MUTED}`}>{t('common.loading')}</p>;

  const uploading = progress !== null;

  return (
    <div className="flex flex-col gap-3">
      <p className={INFO_BOX}>{t('admin.events.materials.intro')}</p>

      <div className="flex flex-wrap items-center gap-2">
        {canUpload ? (
          <>
            <Button variant="cta" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
              <Upload />
              {uploading
                ? t('admin.events.materials.uploading', progress)
                : t('admin.events.materials.upload')}
            </Button>
            <Button variant="outline" size="sm" onClick={openPicker} disabled={uploading}>
              <FolderOpen />
              {t('admin.events.materials.fromPost.open')}
            </Button>
            <Button variant="outline" size="sm" onClick={openLinkDialog} disabled={uploading}>
              <Link2 />
              {t('admin.events.materials.link.open')}
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={MATERIAL_ACCEPT}
              onChange={pickFiles}
              className="hidden"
              aria-label={t('admin.events.materials.upload')}
            />
            <p className={HINT}>{t('admin.events.materials.hint', { size: MAX_MB, max: MAX_MATERIALS_PER_EVENT })}</p>
          </>
        ) : (
          <p className={`text-sm ${MUTED}`}>{t('admin.events.materials.notPublished')}</p>
        )}
      </div>

      {result?.uploaded > 0 && (
        <p role="status" className={SUCCESS_BOX}>
          {t(countKey('admin.events.materials.uploaded', result.uploaded), { count: result.uploaded })}
        </p>
      )}
      {result?.added && (
        <p role="status" className={SUCCESS_BOX}>
          {t('admin.events.materials.added', { name: result.added })}
        </p>
      )}
      {result?.errors.length > 0 && (
        <ul role="alert" className={`${ERROR_BOX} flex flex-col gap-1`}>
          {result.errors.map((text, i) => <li key={i}>{text}</li>)}
        </ul>
      )}

      {materials.length === 0 ? (
        <p className={`text-sm ${MUTED}`}>{t('admin.events.materials.empty')}</p>
      ) : (
        <div className={TABLE_WRAP}>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={TH}>{t('admin.events.materials.columns.name')}</th>
                <th className={`${TH} text-right`}>{t('admin.events.materials.columns.size')}</th>
                <th className={TH}>{t('admin.events.materials.columns.uploadedAt')}</th>
                <th className={TH}><span className="sr-only">{t('admin.events.materials.download')}</span></th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m.id} className={TR}>
                  <td className={`${TD} ${INK} break-all`}>
                    {m.fileName}
                    {m.postSlug && (
                      <span className={`${CHIP} ${TONE.info} ml-2`}>{t('admin.events.materials.fromPost.chip')}</span>
                    )}
                    {m.url && (
                      <span className={`${CHIP} ${TONE.info} ml-2`}>{t('admin.events.materials.link.chip')}</span>
                    )}
                  </td>
                  <td className={`${TD} text-right whitespace-nowrap ${MUTED}`}>{m.url ? '—' : formatSize(m.fileSize, locale)}</td>
                  <td className={`${TD} whitespace-nowrap text-xs ${MUTED}`}>{formatEventDate(m.createdAt, locale)}</td>
                  <td className={TD}>
                    <div className="flex justify-end gap-1.5">
                      <Button asChild variant="outline" size="sm">
                        {m.url ? (
                          <a href={m.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink />
                            {t('admin.events.materials.link.action')}
                          </a>
                        ) : (
                          <a href={m.downloadUrl} download={m.fileName}>
                            <Download />
                            {t('admin.events.materials.download')}
                          </a>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={t('admin.events.materials.deleteAria', { name: m.fileName })}
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting(m);
                        }}
                      >
                        <Trash2 />
                        {t('admin.events.materials.delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('admin.events.materials.deleteTitle')}
        message={deleting
          ? t(`admin.events.materials.${deleting.url ? 'link.deleteBody' : deleting.postSlug ? 'fromPost.deleteBody' : 'deleteBody'}`, { name: deleting.fileName })
          : ''}
        confirmLabel={t('admin.events.materials.deleteConfirm')}
        destructive
        busy={deleteBusy}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={Boolean(picker)}
        title={t('admin.events.materials.fromPost.title')}
        message={t('admin.events.materials.fromPost.body')}
        confirmLabel={t(picker?.posts?.length > 0 ? 'admin.events.materials.fromPost.confirm' : 'common.close')}
        busy={pickerBusy || picker?.posts === null}
        error={pickerError}
        onConfirm={attachPost}
        onCancel={closePicker}
      >
        {picker?.posts?.length > 0 && (
          <div className="flex flex-col gap-1">
            <label htmlFor="admin-event-material-post" className={LABEL}>{t('admin.events.materials.fromPost.label')}</label>
            <select
              id="admin-event-material-post"
              value={picker.slug}
              onChange={(e) => setPicker({ ...picker, slug: e.target.value })}
              className={INPUT}
            >
              {picker.posts.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.publishedAt ? `${p.title} · ${formatEventDate(p.publishedAt, locale)}` : p.title}
                </option>
              ))}
            </select>
          </div>
        )}
        {picker?.posts?.length === 0 && !pickerError && (
          <p className={`text-sm ${MUTED}`}>{t('admin.events.materials.fromPost.empty')}</p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(link)}
        title={t('admin.events.materials.link.title')}
        message={t('admin.events.materials.link.body')}
        confirmLabel={t('admin.events.materials.link.confirm')}
        busy={linkBusy}
        error={linkError}
        onConfirm={addLink}
        onCancel={closeLinkDialog}
      >
        {link && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="admin-event-material-link-name" className={LABEL}>{t('admin.events.materials.link.nameLabel')}</label>
              <input
                id="admin-event-material-link-name"
                type="text"
                value={link.name}
                maxLength={MATERIAL_NAME_MAX}
                placeholder={t('admin.events.materials.link.namePlaceholder')}
                onChange={(e) => setLink({ ...link, name: e.target.value })}
                className={INPUT}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="admin-event-material-link-url" className={LABEL}>{t('admin.events.materials.link.urlLabel')}</label>
              <input
                id="admin-event-material-link-url"
                type="url"
                value={link.url}
                placeholder="https://"
                onChange={(e) => setLink({ ...link, url: e.target.value })}
                className={INPUT}
              />
            </div>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
