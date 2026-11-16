'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminService } from '@/app/services/core/AdminService';
import { useI18n } from '@/lib/i18n';
import { toCsv } from '@/lib/utils/csv';
import routes from '@/routes';
import {
  CHIP, ERROR_BOX, INK, MUTED, SUCCESS_BOX, TABLE_WRAP, TD, TH, TONE, TR,
} from '../../eventos/_components/ui';
import CourseNotifySubscriptions from './CourseNotifySubscriptions';

const NS = 'admin.tutors.recruitment';

/**
 * Estado de oferta de una materia con estudiantes esperando:
 *   - needsTutor:     nadie la ofrece → reclutar
 *   - noAvailability: hay tutores aprobados, pero ninguno visible → falta
 *                     disponibilidad (recordatorio), no reclutar
 *   - covered:        algún tutor visible (el aviso ya debió salir)
 */
export function supplyState(row) {
  if (!row.needsTutor) return 'covered';
  return row.approvedTutors > 0 ? 'noAvailability' : 'needsTutor';
}

const STATE_TONE = { needsTutor: TONE.danger, noAvailability: TONE.warning, covered: TONE.success };

function downloadCsv(filename, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Tutores → Reclutamiento: qué materias necesitan tutor, de revisión diaria
 * (docs/admin/ADMIN-REORG-FUNCTIONAL.md §4.1.1). Debajo, el detalle de cada
 * suscripción «Avísame».
 */
export default function RecruitmentPanel() {
  const { t, formatDate } = useI18n();
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({ reload: null, items: [], error: false });

  useEffect(() => {
    let ignore = false;
    AdminService.getRecruitmentDemand().then((res) => {
      if (ignore) return;
      setState(res.success
        ? { reload, items: res.items || [], error: false }
        : { reload, items: [], error: true });
    });
    return () => { ignore = true; };
  }, [reload]);

  const loading = state.reload !== reload;
  const { items } = state;
  const uncovered = items.filter((r) => r.needsTutor);

  const exportCsv = () => {
    const rows = items.map((r) => ({
      ...r,
      state: t(`${NS}.state.${supplyState(r)}`),
      oldestAt: r.oldestAt ? new Date(r.oldestAt).toISOString().slice(0, 10) : '',
    }));
    const columns = [
      { key: 'courseCode', header: t(`${NS}.columns.code`) },
      { key: 'courseName', header: t(`${NS}.columns.course`) },
      { key: 'waiting', header: t(`${NS}.columns.waiting`) },
      { key: 'oldestAt', header: t(`${NS}.columns.oldest`) },
      { key: 'listedTutors', header: t(`${NS}.columns.listed`) },
      { key: 'approvedTutors', header: t(`${NS}.columns.approved`) },
      { key: 'pendingRequests', header: t(`${NS}.columns.requests`) },
      { key: 'state', header: t(`${NS}.columns.state`) },
    ];
    downloadCsv(`calico-reclutamiento-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows, columns));
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h3 className={`text-sm font-bold ${INK}`}>{t(`${NS}.title`)}</h3>
            <p className={`text-xs max-w-2xl ${MUTED}`}>{t(`${NS}.subtitle`)}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setReload((n) => n + 1)} disabled={loading}>
              <RefreshCcw className={loading ? 'animate-spin' : ''} />
              {t(`${NS}.refresh`)}
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={loading || items.length === 0}>
              <Download />
              {t(`${NS}.exportCsv`)}
            </Button>
          </div>
        </div>

        {loading ? (
          <p className={`text-sm ${MUTED}`}>{t('common.loading')}</p>
        ) : state.error ? (
          <p className={ERROR_BOX}>{t(`${NS}.error`)}</p>
        ) : items.length === 0 ? (
          <p className={SUCCESS_BOX}>{t(`${NS}.empty`)}</p>
        ) : (
          <>
            <p className={`text-xs ${MUTED}`}>
              {t(`${NS}.summary`, {
                uncovered: uncovered.length,
                waiting: uncovered.reduce((sum, r) => sum + r.waiting, 0),
              })}
            </p>
            <div className={TABLE_WRAP}>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={TH}>{t(`${NS}.columns.course`)}</th>
                    <th className={`${TH} text-right`}>{t(`${NS}.columns.waiting`)}</th>
                    <th className={TH}>{t(`${NS}.columns.oldest`)}</th>
                    <th className={`${TH} text-right`}>{t(`${NS}.columns.tutors`)}</th>
                    <th className={`${TH} text-right`}>{t(`${NS}.columns.requests`)}</th>
                    <th className={TH}>{t(`${NS}.columns.state`)}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => {
                    const supply = supplyState(r);
                    return (
                      <tr key={r.courseId} className={TR}>
                        <td className={TD}>
                          <span className={`font-mono text-xs font-semibold ${INK}`}>{r.courseCode}</span>
                          <span className={`block ${INK}`}>{r.courseName}</span>
                        </td>
                        <td className={`${TD} text-right font-semibold ${INK}`}>{r.waiting}</td>
                        <td className={`${TD} whitespace-nowrap ${MUTED}`}>
                          {r.oldestAt ? formatDate(r.oldestAt, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td className={`${TD} text-right ${MUTED}`}>
                          {t(`${NS}.tutorsValue`, { listed: r.listedTutors, approved: r.approvedTutors })}
                        </td>
                        <td className={`${TD} text-right`}>
                          {r.pendingRequests > 0 ? (
                            <Link
                              href={routes.ADMIN_COURSES_TAB('courseRequests')}
                              className="text-xs font-semibold text-[var(--calico-orange-text)] hover:underline"
                            >
                              {t(`${NS}.requestsLink`, { count: r.pendingRequests })}
                            </Link>
                          ) : (
                            <span className={MUTED}>0</span>
                          )}
                        </td>
                        <td className={TD}>
                          <span className={`${CHIP} ${STATE_TONE[supply]}`}>{t(`${NS}.state.${supply}`)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <CourseNotifySubscriptions />
    </div>
  );
}
