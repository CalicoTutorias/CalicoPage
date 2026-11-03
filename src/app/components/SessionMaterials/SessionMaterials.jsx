'use client';

/**
 * Study material of one tutoring session. What it shows comes from the server:
 *  - tutor or admin: the list, plus uploading and removing files;
 *  - student with a review and a comment: the list, to download;
 *  - student without them: how many files there are and what unlocks them;
 *  - anyone else, or a student when there is nothing: nothing.
 * Each download asks for a 5-minute presigned URL at click time and navigates to
 * it (the response is an attachment, so the page stays put). Remount it (key) when
 * the student's review changes so the list is fetched again.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileText, Loader2, Lock, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MATERIAL_ACCEPT, MAX_MATERIAL_FILE_SIZE, materialContentType } from '@/lib/events/event-materials';
import { countKey } from '@/lib/utils/event-format';
import { useI18n } from '@/lib/i18n';
import { SessionMaterialService } from '../../services/core/SessionMaterialService';

const SECTION = 'flex flex-col gap-2 rounded-[var(--radius-xl)] border border-[var(--calico-slate-200)] bg-white p-4';
const MUTED = 'text-xs text-[var(--calico-body-muted)]';
const ERROR = 'text-xs font-medium text-[var(--calico-danger-strong)]';
const KNOWN_ERRORS = new Set([
  'FORBIDDEN',
  'MATERIALS_LOCKED',
  'MATERIAL_NOT_FOUND',
  'MATERIAL_TYPE_INVALID',
  'MATERIAL_TOO_LARGE',
  'MATERIAL_LIMIT',
  'SESSION_NOT_ELIGIBLE',
  'UPLOAD_FAILED',
]);

function formatSize(bytes, locale) {
  const fmt = (n) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 1 }).format(n);
  if (bytes >= 1024 * 1024) return `${fmt(bytes / 1024 / 1024)} MB`;
  return `${fmt(Math.max(1, bytes / 1024))} KB`;
}

export default function SessionMaterials({ sessionId, onCountChange }) {
  const { t, locale } = useI18n();
  const [view, setView] = useState({ status: 'loading' });
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(null); // 'upload' or the id of a material
  const [error, setError] = useState('');
  const fileInput = useRef(null);

  useEffect(() => {
    let active = true;
    SessionMaterialService.list(sessionId)
      .then((res) => {
        if (!active) return;
        if (res?.success) {
          setView({ status: 'ready', ...res });
          onCountChange?.(res.count);
        } else {
          setView({ status: res?.status === 403 || res?.status === 404 ? 'hidden' : 'error' });
        }
      })
      .catch(() => {
        if (active) setView({ status: 'error' });
      });
    return () => { active = false; };
    // onCountChange is a notification, not an input: a new callback is no reason to fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, reload]);

  const messageFor = useCallback((res, fallback) => {
    if (res?.status === 429) return t('sessionMaterials.errors.RATE_LIMITED');
    return t(KNOWN_ERRORS.has(res?.error) ? `sessionMaterials.errors.${res.error}` : fallback);
  }, [t]);

  const uploadFiles = async (event) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ''; // so choosing the same file again fires `change`
    if (files.length === 0) return;

    setError('');
    setBusy('upload');
    try {
      for (const file of files) {
        if (!materialContentType(file.name)) {
          setError(`${file.name}: ${t('sessionMaterials.errors.MATERIAL_TYPE_INVALID')}`);
          return;
        }
        if (file.size > MAX_MATERIAL_FILE_SIZE) {
          setError(`${file.name}: ${t('sessionMaterials.errors.MATERIAL_TOO_LARGE')}`);
          return;
        }
        const res = await SessionMaterialService.upload(sessionId, file);
        if (!res?.success) {
          setError(`${file.name}: ${messageFor(res, 'sessionMaterials.errors.upload')}`);
          return;
        }
      }
    } catch {
      setError(t('sessionMaterials.errors.upload'));
    } finally {
      setBusy(null);
      setReload((n) => n + 1);
    }
  };

  const download = async (material) => {
    setError('');
    setBusy(material.id);
    try {
      const res = await SessionMaterialService.getDownloadUrl(sessionId, material.id);
      if (res?.success && res.url) window.location.assign(res.url);
      else setError(messageFor(res, 'sessionMaterials.errors.download'));
    } catch {
      setError(t('sessionMaterials.errors.download'));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (material) => {
    if (!window.confirm(t('sessionMaterials.deleteConfirm', { name: material.fileName }))) return;
    setError('');
    setBusy(material.id);
    try {
      const res = await SessionMaterialService.remove(sessionId, material.id);
      if (res?.success) setReload((n) => n + 1);
      else setError(messageFor(res, 'sessionMaterials.errors.delete'));
    } catch {
      setError(t('sessionMaterials.errors.delete'));
    } finally {
      setBusy(null);
    }
  };

  if (view.status === 'hidden') return null;
  if (view.status === 'ready' && !view.canManage && view.count === 0) return null;

  const title = <h3 className="text-sm font-semibold text-[var(--calico-ink)]">{t('sessionMaterials.title')}</h3>;

  if (view.status === 'loading') {
    return <section className={SECTION}>{title}<p className={MUTED}>{t('common.loading')}</p></section>;
  }
  if (view.status === 'error') {
    return <section className={SECTION}>{title}<p role="alert" className={ERROR}>{t('sessionMaterials.errors.load')}</p></section>;
  }

  if (view.locked) {
    const key = view.lockReason === 'COMMENT_REQUIRED' ? 'sessionMaterials.lockedNeedsComment' : 'sessionMaterials.locked';
    return (
      <section className={SECTION}>
        {title}
        <p role="status" className="flex items-start gap-2 text-sm text-[var(--calico-info-text)] bg-[var(--calico-info-soft)] rounded-[var(--radius-lg)] px-3 py-2">
          <Lock className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          {t(countKey(key, view.count), { count: view.count })}
        </p>
      </section>
    );
  }

  return (
    <section className={SECTION}>
      {title}
      {view.canManage && <p className={MUTED}>{t('sessionMaterials.managerHint')}</p>}
      {view.canManage && view.materials.length === 0 && <p className={MUTED}>{t('sessionMaterials.empty')}</p>}

      {view.materials.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--calico-slate-100)]">
          {view.materials.map((material) => (
            <li key={material.id} className="flex items-center gap-2 py-2 min-w-0">
              <FileText className="w-4 h-4 shrink-0 text-[var(--calico-body-muted)]" aria-hidden="true" />
              <span className="flex flex-col min-w-0 flex-1">
                <span className="text-sm text-[var(--calico-ink)] truncate">{material.fileName}</span>
                <span className={MUTED}>
                  {formatSize(material.fileSize, locale)}
                  {view.canManage && ` · ${t(material.uploadedByTutor ? 'sessionMaterials.uploadedByTutor' : 'sessionMaterials.uploadedByCalico')}`}
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy !== null}
                aria-label={t('sessionMaterials.downloadAria', { name: material.fileName })}
                onClick={() => download(material)}
              >
                <Download aria-hidden="true" />
                {t('sessionMaterials.download')}
              </Button>
              {material.canDelete && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy !== null}
                  aria-label={t('sessionMaterials.deleteAria', { name: material.fileName })}
                  onClick={() => remove(material)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {view.canUpload && (
        <div>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={MATERIAL_ACCEPT}
            onChange={uploadFiles}
            className="hidden"
            aria-label={t('sessionMaterials.upload')}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => fileInput.current?.click()}
          >
            {busy === 'upload' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
            {t(busy === 'upload' ? 'sessionMaterials.uploading' : 'sessionMaterials.upload')}
          </Button>
        </div>
      )}

      {error && <p role="alert" className={ERROR}>{error}</p>}
    </section>
  );
}
