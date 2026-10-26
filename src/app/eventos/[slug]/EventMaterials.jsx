"use client";

/**
 * "Study material" section of the event page, for a Confirmed registrant of
 * an event that has material (`materials.count > 0`).
 *  - locked (survey not answered yet): how many files there are, plus the
 *    survey button once the survey is open;
 *  - unlocked: the file list. Each download asks the API for a 5-minute
 *    presigned URL at click time and navigates to it (the response is an
 *    attachment, so the page stays put).
 * Remount it (key) when `materials.unlocked` changes so the list is fetched.
 */

import { useEffect, useState } from 'react';
import { Download, FileText, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EventService } from '../../services/core/EventService';
import { useI18n } from '../../../lib/i18n';
import { countKey } from '../../../lib/utils/event-format';
import styles from '../eventos.module.css';

function formatSize(bytes, locale) {
  const fmt = (n) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 1 }).format(n);
  if (bytes >= 1024 * 1024) return `${fmt(bytes / 1024 / 1024)} MB`;
  return `${fmt(Math.max(1, bytes / 1024))} KB`;
}

export default function EventMaterials({ slug, materials, surveyPending, onAnswerSurvey }) {
  const { t, locale } = useI18n();
  // status: 'loading' | 'ready' | 'error' (only used when unlocked)
  const [list, setList] = useState({ status: 'loading', files: [] });
  const [downloading, setDownloading] = useState(null); // material id
  const [downloadError, setDownloadError] = useState(false);

  useEffect(() => {
    if (!materials.unlocked) return undefined;
    let active = true;
    EventService.listMaterials(slug).then((res) => {
      if (!active) return;
      setList(res.success ? { status: 'ready', files: res.materials ?? [] } : { status: 'error', files: [] });
    });
    return () => { active = false; };
  }, [slug, materials.unlocked]);

  const download = async (file) => {
    setDownloading(file.id);
    setDownloadError(false);
    const res = await EventService.getMaterialDownloadUrl(slug, file.id);
    setDownloading(null);
    if (res.success && res.url) window.location.assign(res.url);
    else setDownloadError(true);
  };

  return (
    <section>
      <h2 className={styles.sectionTitle}>{t('events.materials.title')}</h2>

      {!materials.unlocked && (
        <div className={styles.materialLocked}>
          <div className={styles.callout} role="status">
            <Lock aria-hidden="true" />
            <p className={styles.calloutTitle}>
              {t(countKey('events.materials.locked', materials.count), { count: materials.count })}
            </p>
          </div>
          {surveyPending && (
            <Button type="button" variant="cta" onClick={onAnswerSurvey}>
              {t('events.detail.answerSurvey')}
            </Button>
          )}
        </div>
      )}

      {materials.unlocked && list.status === 'loading' && (
        <div className={`${styles.skeleton} ${styles.skeletonLine}`} aria-hidden="true" />
      )}
      {materials.unlocked && list.status === 'error' && (
        <p className={`${styles.callout} ${styles.calloutDanger}`} role="alert">{t('events.materials.loadError')}</p>
      )}
      {materials.unlocked && list.status === 'ready' && (
        <ul className={styles.materialList}>
          {list.files.map((file) => (
            <li key={file.id} className={styles.materialItem}>
              <FileText aria-hidden="true" />
              <span className={styles.materialInfo}>
                <span className={styles.materialName}>{file.fileName}</span>
                <span className={styles.materialMeta}>{formatSize(file.fileSize, locale)}</span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={downloading !== null}
                aria-label={t('events.materials.downloadAria', { name: file.fileName })}
                onClick={() => download(file)}
              >
                <Download aria-hidden="true" />
                {t('events.materials.download')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {downloadError && (
        <p className={`${styles.callout} ${styles.calloutDanger}`} role="alert">{t('events.materials.downloadError')}</p>
      )}
    </section>
  );
}
