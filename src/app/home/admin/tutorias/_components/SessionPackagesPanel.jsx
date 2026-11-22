'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminService } from '../../../../services/core/AdminService';
import { useI18n } from '../../../../../lib/i18n';
import { CARD, CHIP, ERROR_BOX, HINT, INK, MUTED, TABLE_WRAP, TD, TH, TONE, TR } from '../../eventos/_components/ui';
import { errorKey } from './errors';

const STATUS_TONE = { ACTIVE: TONE.success, CLOSED: TONE.neutral };

/**
 * Hours packages of manual sessions: hours used and left, the tier agreed and
 * what the student would owe back if the package closed today (they took fewer
 * hours than their tier needs). Closing one stops new sessions from using it
 * and records that amount. `refreshToken` changes when the form books a session.
 */
export default function SessionPackagesPanel({ refreshToken, onChanged }) {
  const { t, formatCurrency, formatDate } = useI18n();
  const [reload, setReload] = useState(0);
  const [{ status, packages, res }, setList] = useState({ status: 'loading', packages: [] });
  const [closingId, setClosingId] = useState(null);
  const [rowError, setRowError] = useState(null);

  useEffect(() => {
    let active = true;
    AdminService.listSessionPackages()
      .then((result) => {
        if (!active) return;
        setList(result?.success
          ? { status: 'ready', packages: result.packages }
          : { status: 'error', packages: [], res: result });
      })
      .catch(() => {
        if (active) setList({ status: 'error', packages: [] });
      });
    return () => { active = false; };
  }, [reload, refreshToken]);

  const close = async (pkg) => {
    const message = pkg.settlementAmount > 0
      ? t('admin.manualSessions.packages.confirmCloseOwed', { amount: formatCurrency(pkg.settlementAmount, 'COP') })
      : t('admin.manualSessions.packages.confirmClose');
    if (!window.confirm(message)) return;
    setClosingId(pkg.id);
    setRowError(null);
    try {
      const result = await AdminService.closeSessionPackage(pkg.id);
      if (result?.success) {
        setList((current) => ({
          ...current,
          packages: current.packages.map((p) => (p.id === pkg.id ? result.package : p)),
        }));
        onChanged?.();
      } else {
        setRowError({ id: pkg.id, message: t(errorKey(result, 'admin.manualSessions.packages.errors.close')) });
      }
    } catch {
      setRowError({ id: pkg.id, message: t('admin.manualSessions.packages.errors.close') });
    } finally {
      setClosingId(null);
    }
  };

  const tierLabel = (pkg) => t(pkg.tutorSharePercent >= 100
    ? 'admin.manualSessions.packages.tierTutor'
    : 'admin.manualSessions.packages.tierShared', {
    percent: pkg.discountPercent,
    tutorPercent: (pkg.discountPercent * pkg.tutorSharePercent) / 100,
    calicoPercent: (pkg.discountPercent * (100 - pkg.tutorSharePercent)) / 100,
  });

  return (
    <section className="flex flex-col gap-3" aria-labelledby="session-packages-title">
      <div>
        <h3 id="session-packages-title" className={`text-base font-bold ${INK}`}>{t('admin.manualSessions.packages.title')}</h3>
        <p className={`${HINT} max-w-3xl`}>{t('admin.manualSessions.packages.subtitle')}</p>
      </div>

      {status === 'loading' && <p className={`${CARD} p-5 text-sm ${MUTED}`}>{t('common.loading')}</p>}

      {status === 'error' && (
        <div className={`${ERROR_BOX} flex items-center justify-between gap-2 flex-wrap`}>
          {t(errorKey(res, 'admin.manualSessions.packages.errors.load'))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setList({ status: 'loading', packages: [] });
              setReload((n) => n + 1);
            }}
          >
            {t('admin.manualSessions.retry')}
          </Button>
        </div>
      )}

      {status === 'ready' && packages.length === 0 && (
        <p className={`${CARD} p-5 text-sm ${MUTED}`}>{t('admin.manualSessions.packages.empty')}</p>
      )}

      {status === 'ready' && packages.length > 0 && (
        <div className={TABLE_WRAP}>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={TH}>{t('admin.manualSessions.packages.columns.student')}</th>
                <th className={TH}>{t('admin.manualSessions.packages.columns.tutorCourse')}</th>
                <th className={TH}>{t('admin.manualSessions.packages.columns.hours')}</th>
                <th className={TH}>{t('admin.manualSessions.packages.columns.tier')}</th>
                <th className={TH}>{t('admin.manualSessions.packages.columns.owed')}</th>
                <th className={TH}>{t('admin.manualSessions.packages.columns.status')}</th>
                <th className={TH}>{t('admin.manualSessions.list.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((pkg) => (
                <tr key={pkg.id} className={TR}>
                  <td className={`${TD} ${INK}`}>
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{pkg.student?.email}</span>
                      {!pkg.student?.external && <span className={`text-xs ${MUTED}`}>{pkg.student?.name}</span>}
                    </div>
                  </td>
                  <td className={`${TD} ${INK}`}>
                    <div className="flex flex-col min-w-0">
                      <span>{pkg.tutor?.name}</span>
                      <span className={`text-xs ${MUTED}`}>{pkg.course?.code} · {pkg.course?.name}</span>
                    </div>
                  </td>
                  <td className={`${TD} whitespace-nowrap ${INK}`}>
                    <div className="flex flex-col">
                      <span>{t('admin.manualSessions.packages.hoursUsed', { used: pkg.usedHours, committed: pkg.committedHours })}</span>
                      {pkg.status === 'ACTIVE' && (
                        <span className={`text-xs ${MUTED}`}>{t('admin.manualSessions.packages.hoursLeft', { hours: pkg.remainingHours })}</span>
                      )}
                    </div>
                  </td>
                  <td className={`${TD} ${INK}`}>{tierLabel(pkg)}</td>
                  <td className={`${TD} whitespace-nowrap ${INK}`}>
                    <div className="flex flex-col">
                      <span>{pkg.settlementAmount > 0 ? formatCurrency(pkg.settlementAmount, 'COP') : '—'}</span>
                      {pkg.settlementAmount > 0 && (
                        <span className={`text-xs ${MUTED}`}>
                          {t(pkg.status === 'ACTIVE'
                            ? 'admin.manualSessions.packages.owedIfClosedNow'
                            : 'admin.manualSessions.packages.owedRecorded')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={TD}>
                    <span className={`${CHIP} ${STATUS_TONE[pkg.status] ?? TONE.neutral}`}>
                      {t(`admin.manualSessions.packages.status.${pkg.status}`)}
                    </span>
                    {pkg.closedAt && (
                      <span className={`block text-xs mt-1 ${MUTED}`}>{formatDate(pkg.closedAt)}</span>
                    )}
                  </td>
                  <td className={TD}>
                    {pkg.status === 'ACTIVE' && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={closingId === pkg.id}
                        onClick={() => close(pkg)}
                      >
                        {closingId === pkg.id && <Loader2 className="animate-spin" />}
                        {t('admin.manualSessions.packages.close')}
                      </Button>
                    )}
                    {rowError?.id === pkg.id && <p role="alert" className={`${ERROR_BOX} mt-2`}>{rowError.message}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
