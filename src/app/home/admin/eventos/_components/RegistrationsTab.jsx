'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminEventService } from '@/app/services/core/AdminEventService';
import { useI18n } from '@/lib/i18n';
import { formatEventDate } from '@/lib/utils/event-format';
import { CHIP, ERROR_BOX, INK, MUTED, TABLE_WRAP, TD, TH, TONE, TR } from './ui';

const STATUS_TONE = {
  Confirmed: TONE.success,
  PendingPayment: TONE.warning,
  Canceled: TONE.neutral,
};

/** Registrations of one event (every status) plus the CSV export. */
export default function RegistrationsTab({ eventId, slug }) {
  const { t, formatCurrency, locale } = useI18n();
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [csvError, setCsvError] = useState(false);

  useEffect(() => {
    let active = true;
    AdminEventService.registrations(eventId).then((res) => {
      if (!active) return;
      if (res.success) setRows(res.registrations || []);
      else setLoadError(true);
    });
    return () => { active = false; };
  }, [eventId]);

  const downloadCsv = async () => {
    setDownloading(true);
    setCsvError(false);
    const res = await AdminEventService.downloadRegistrationsCsv(eventId, slug);
    setDownloading(false);
    if (!res.success) setCsvError(true);
  };

  if (loadError) return <p className={ERROR_BOX}>{t('admin.events.registrations.load')}</p>;
  if (!rows) return <p className={`text-sm ${MUTED}`}>{t('common.loading')}</p>;

  const yesNo = (v) => (v ? t('admin.events.registrations.yes') : t('admin.events.registrations.no'));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {csvError && <p className={`${ERROR_BOX} mr-auto`}>{t('admin.events.errors.csv')}</p>}
        <Button variant="outline" size="sm" onClick={downloadCsv} disabled={downloading || rows.length === 0}>
          <Download />
          {t('admin.events.registrations.downloadCsv')}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className={`text-sm ${MUTED}`}>{t('admin.events.registrations.empty')}</p>
      ) : (
        <div className={TABLE_WRAP}>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={TH}>{t('admin.events.registrations.columns.name')}</th>
                <th className={TH}>{t('admin.events.registrations.columns.phone')}</th>
                <th className={TH}>{t('admin.events.registrations.columns.career')}</th>
                <th className={TH}>{t('admin.events.registrations.columns.source')}</th>
                <th className={TH}>{t('admin.events.registrations.columns.status')}</th>
                <th className={TH}>{t('admin.events.registrations.columns.earlyBird')}</th>
                <th className={`${TH} text-right`}>{t('admin.events.registrations.columns.amount')}</th>
                <th className={TH}>{t('admin.events.registrations.columns.survey')}</th>
                <th className={TH}>{t('admin.events.registrations.columns.registeredAt')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={TR}>
                  <td className={TD}>
                    <p className={`font-medium ${INK}`}>{r.name || '—'}</p>
                    <p className={`text-xs ${MUTED}`}>{r.email}</p>
                  </td>
                  <td className={`${TD} whitespace-nowrap ${INK}`}>{r.phone || '—'}</td>
                  <td className={`${TD} ${INK}`}>{r.career || '—'}</td>
                  <td className={`${TD} font-mono text-xs ${MUTED}`}>{r.source || '—'}</td>
                  <td className={TD}>
                    <span className={`${CHIP} ${STATUS_TONE[r.status] || TONE.neutral}`}>
                      {t(`admin.events.registrations.status.${r.status}`)}
                    </span>
                  </td>
                  <td className={TD}>
                    {r.earlyBird && <span className={`${CHIP} ${TONE.info}`}>{t('admin.events.registrations.earlyBird')}</span>}
                  </td>
                  <td className={`${TD} text-right whitespace-nowrap ${INK}`}>
                    {Number(r.finalAmount) > 0 ? formatCurrency(r.finalAmount, 'COP') : t('admin.events.registrations.free')}
                  </td>
                  <td className={`${TD} ${INK}`}>{yesNo(r.surveyAnswered)}</td>
                  <td className={`${TD} whitespace-nowrap text-xs ${MUTED}`}>
                    {r.registeredAt ? formatEventDate(r.registeredAt, locale) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
