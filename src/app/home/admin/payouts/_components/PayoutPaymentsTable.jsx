'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminService } from '../../../../services/core/AdminService';
import { useI18n } from '../../../../../lib/i18n';
import { CARD, CHIP, ERROR_BOX, HINT, INK, MUTED, TABLE_WRAP, TD, TH, TONE, TR } from '../../eventos/_components/ui';

const PAGE_SIZE = 25;
const PAYOUT_FILTERS = ['pending', 'paid', 'all'];
const TYPE_FILTERS = ['all', 'wompi', 'manual'];
// This header is longer than its dates: it wraps so the actions column stays in view.
const WRAPPING_TH = TH.replace(' whitespace-nowrap', '');

const TYPE_TONE = {
  wompi: TONE.info,
  manual: TONE.warning,
  courtesy: TONE.neutral,
};

const PAYOUT_TONE = {
  pending: TONE.warning,
  paid: TONE.success,
};

function FilterGroup({ label, options, value, onChange, labelFor }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1 flex-wrap">
      <span className={`text-xs mr-1 ${MUTED}`}>{label}</span>
      {options.map((option) => (
        <Button
          key={option}
          type="button"
          size="sm"
          variant={value === option ? 'default' : 'outline'}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {labelFor(option)}
        </Button>
      ))}
    </div>
  );
}

/**
 * Payment by payment: how the student paid (Wompi, manual or courtesy) and
 * whether the tutor was already paid. Owns its filters and page; the parent
 * owns the confirmation modal, so `onMarkPaid` opens it and `refreshToken`
 * changes once it is done.
 */
export default function PayoutPaymentsTable({ refreshToken, onMarkPaid }) {
  const { t, formatCurrency, formatDate, formatDateTime } = useI18n();

  const [payout, setPayout] = useState('pending');
  const [type, setType] = useState('all');
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [{ status, items, total }, setList] = useState({ status: 'loading', items: [], total: 0 });

  useEffect(() => {
    let active = true;
    AdminService.listPayouts({ view: 'flat', payout, type, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((res) => {
        if (!active) return;
        setList(res?.success
          ? { status: 'ready', items: res.items, total: res.total }
          : { status: 'error', items: [], total: 0 });
      })
      .catch(() => {
        if (active) setList({ status: 'error', items: [], total: 0 });
      });
    return () => { active = false; };
  }, [payout, type, page, reload, refreshToken]);

  const applyFilter = (setter) => (value) => {
    setter(value);
    setPage(0);
    setList({ status: 'loading', items: [], total: 0 });
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
        <FilterGroup
          label={t('admin.payouts.filters.payoutLabel')}
          options={PAYOUT_FILTERS}
          value={payout}
          onChange={applyFilter(setPayout)}
          labelFor={(option) => t(`admin.payouts.filters.payout.${option}`)}
        />
        <FilterGroup
          label={t('admin.payouts.filters.typeLabel')}
          options={TYPE_FILTERS}
          value={type}
          onChange={applyFilter(setType)}
          labelFor={(option) => t(`admin.payouts.filters.type.${option}`)}
        />
      </div>

      {status === 'loading' && <p className={`${CARD} p-5 text-sm ${MUTED}`}>{t('common.loading')}</p>}

      {status === 'error' && (
        <div className={`${ERROR_BOX} flex items-center justify-between gap-2 flex-wrap`}>
          {t('admin.payouts.loadError')}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setList({ status: 'loading', items: [], total: 0 });
              setReload((n) => n + 1);
            }}
          >
            {t('admin.payouts.retry')}
          </Button>
        </div>
      )}

      {status === 'ready' && items.length === 0 && (
        <p className={`${CARD} p-5 text-sm ${MUTED}`}>{t('admin.payouts.detail.empty')}</p>
      )}

      {status === 'ready' && items.length > 0 && (
        <div className={TABLE_WRAP}>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={WRAPPING_TH}>{t('admin.payouts.table.sessionDate')}</th>
                <th className={TH}>{t('admin.payouts.table.course')}</th>
                <th className={TH}>{t('admin.payouts.table.tutor')}</th>
                <th className={TH}>{t('admin.payouts.table.paymentType')}</th>
                <th className={TH}>{t('admin.payouts.table.charged')}</th>
                <th className={TH}>{t('admin.payouts.table.amount')}</th>
                <th className={TH}>{t('admin.payouts.table.tutorPayout')}</th>
                <th className={TH}>{t('admin.payouts.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={TR}>
                  <td className={`${TD} ${INK}`}>
                    <div>{formatDate(item.session?.startTimestamp, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    <div className={`text-xs whitespace-nowrap ${MUTED}`}>
                      {formatDateTime(item.session?.startTimestamp, { hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </td>
                  <td className={`${TD} ${INK}`}>
                    <div>{item.session?.course?.name}</div>
                    <div className={`text-xs font-mono ${MUTED}`}>{item.session?.course?.code}</div>
                  </td>
                  <td className={`${TD} ${INK}`}>
                    <div>{item.tutor?.name || item.tutor?.email}</div>
                    {item.llave
                      ? <div className={`text-xs font-mono break-all ${MUTED}`}>{item.llave}</div>
                      : <div className="text-xs text-[var(--calico-warning-text)]">{t('admin.payouts.noLlave')}</div>}
                  </td>
                  <td className={TD}>
                    <span className={`${CHIP} ${TYPE_TONE[item.paymentType] ?? TONE.neutral}`}>
                      {t(`admin.payouts.paymentType.${item.paymentType}`)}
                    </span>
                  </td>
                  <td className={`${TD} whitespace-nowrap ${INK}`}>{formatCurrency(item.gross, 'COP')}</td>
                  <td className={`${TD} whitespace-nowrap font-semibold ${INK}`}>{formatCurrency(item.tutorOwed, 'COP')}</td>
                  <td className={TD}>
                    <span className={`${CHIP} ${PAYOUT_TONE[item.tutorPayoutStatus] ?? TONE.neutral}`}>
                      {t(`admin.payouts.payoutStatus.${item.tutorPayoutStatus}`)}
                    </span>
                    {item.tutorPayoutAt && (
                      <div className={`${HINT} mt-1 whitespace-nowrap`}>
                        {formatDateTime(item.tutorPayoutAt, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    )}
                    {item.tutorPayoutNote && <div className={`${HINT} mt-1`}>{item.tutorPayoutNote}</div>}
                  </td>
                  <td className={TD}>
                    {item.tutorPayoutStatus === 'pending' && (
                      <Button
                        size="sm"
                        variant="success"
                        aria-label={t('admin.payouts.detail.markPaidFor', {
                          tutor: item.tutor?.name || item.tutor?.email || '',
                          course: item.session?.course?.name ?? '',
                        })}
                        onClick={() => onMarkPaid(item)}
                      >
                        {t('admin.payouts.detail.markPaid')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {status === 'ready' && total > PAGE_SIZE && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className={`text-xs ${MUTED}`}>
            {t('admin.payouts.detail.page', { page: page + 1, total: totalPages })}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label={t('admin.payouts.detail.previous')}
            >
              <ChevronLeft />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label={t('admin.payouts.detail.next')}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
