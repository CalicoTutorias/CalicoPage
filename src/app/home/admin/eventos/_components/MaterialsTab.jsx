'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminEventService } from '@/app/services/core/AdminEventService';
import { useI18n } from '@/lib/i18n';
import {
  MATERIAL_ACCEPT, MAX_MATERIALS_PER_EVENT, MAX_MATERIAL_FILE_SIZE, materialContentType,
} from '@/lib/events/event-materials';
import { countKey, formatEventDate } from '@/lib/utils/event-format';
import ConfirmDialog from './ConfirmDialog';
import {
  ERROR_BOX, HINT, INFO_BOX, INK, MUTED, SUCCESS_BOX, TABLE_WRAP, TD, TH, TR, errorKey,
} from './ui';

const MAX_MB = MAX_MATERIAL_FILE_SIZE / 1024 / 1024;
const UPLOAD_ERRORS = ['MATERIAL_TYPE_INVALID', 'MATERIAL_TOO_LARGE', 'MATERIAL_LIMIT', 'UPLOAD_FAILED'];

function formatSize(bytes, locale) {
  const fmt = (n) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 1 }).format(n);
  if (bytes >= 1024 * 1024) return `${fmt(bytes / 1024 / 1024)} MB`;
  return `${fmt(Math.max(1, bytes / 1024))} KB`;
}

/**
 * Study material of one event: upload (several files, one after the other:
 * presign → PUT to S3 → register), download and delete. Students download it
 * only once Confirmed and after answering the survey (enforced by the API).
 * Uploads need a Published event (`canUpload`).
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
                  <td className={`${TD} ${INK} break-all`}>{m.fileName}</td>
                  <td className={`${TD} text-right whitespace-nowrap ${MUTED}`}>{formatSize(m.fileSize, locale)}</td>
                  <td className={`${TD} whitespace-nowrap text-xs ${MUTED}`}>{formatEventDate(m.createdAt, locale)}</td>
                  <td className={TD}>
                    <div className="flex justify-end gap-1.5">
                      <Button asChild variant="outline" size="sm">
                        <a href={m.downloadUrl} download={m.fileName}>
                          <Download />
                          {t('admin.events.materials.download')}
                        </a>
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
        message={deleting ? t('admin.events.materials.deleteBody', { name: deleting.fileName }) : ''}
        confirmLabel={t('admin.events.materials.deleteConfirm')}
        destructive
        busy={deleteBusy}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
