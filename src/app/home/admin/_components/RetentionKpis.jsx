'use client';

import { Repeat, UserCheck, CalendarClock, DollarSign } from 'lucide-react';
import { useI18n } from '../../../../lib/i18n';
import KpiCard from './KpiCard';
import MetricInfo from './MetricInfo';

/**
 * Repeat-rate KPI row for the growth page. Reuses KpiCard so it matches the
 * dashboard's top row exactly.
 *
 * Props:
 *  - data: { repeatRate, students, sameTutorRate, medianDaysBetween,
 *            repeatTicket, newTicket } — rates are 0..1 fractions
 *  - loading
 */
export default function RetentionKpis({ data, loading = false }) {
  const { t, formatCurrency } = useI18n();

  const pct = (r) => `${Math.round((r ?? 0) * 100)}%`;
  const studentsLabel = t(
    data?.students === 1 ? 'admin.growth.retention.students_one' : 'admin.growth.retention.students_other',
    { count: data?.students ?? 0 },
  );

  const medianDays = data?.medianDaysBetween;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard
        icon={Repeat}
        label={t('admin.growth.retention.kpi.repeatRate')}
        value={data ? pct(data.repeatRate) : '—'}
        sub={studentsLabel}
        tone="emerald"
        loading={loading}
        info={<MetricInfo baseKey="admin.growth.info.repeatRate" />}
      />
      <KpiCard
        icon={UserCheck}
        label={t('admin.growth.retention.kpi.sameTutorRate')}
        value={data ? pct(data.sameTutorRate) : '—'}
        sub={t('admin.growth.retention.kpi.sameTutorRateSub')}
        tone="blue"
        loading={loading}
        info={<MetricInfo baseKey="admin.growth.info.sameTutorRate" />}
      />
      <KpiCard
        icon={CalendarClock}
        label={t('admin.growth.retention.kpi.medianDays')}
        value={medianDays != null
          ? t('admin.growth.retention.kpi.daysValue', { count: medianDays })
          : '—'}
        sub={t('admin.growth.retention.kpi.medianDaysSub')}
        tone="amber"
        loading={loading}
        info={<MetricInfo baseKey="admin.growth.info.medianDays" />}
      />
      <KpiCard
        icon={DollarSign}
        label={t('admin.growth.retention.kpi.repeatTicket')}
        value={data?.repeatTicket != null ? formatCurrency(data.repeatTicket, 'COP') : '—'}
        sub={data?.newTicket != null
          ? t('admin.growth.retention.kpi.repeatTicketSub', { value: formatCurrency(data.newTicket, 'COP') })
          : t('admin.growth.retention.kpi.repeatTicketSubEmpty')}
        tone="orange"
        loading={loading}
        info={<MetricInfo baseKey="admin.growth.info.repeatTicket" />}
      />
    </div>
  );
}
