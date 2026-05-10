'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, DollarSign, Users, Inbox, RefreshCcw } from 'lucide-react';
import { AdminService } from '../../../services/core/AdminService';
import { useI18n } from '../../../../lib/i18n';
import KpiCard from '../_components/KpiCard';
import SessionsChart from '../_components/SessionsChart';
import RevenueChart from '../_components/RevenueChart';
import TopCoursesTable from '../_components/TopCoursesTable';
import TopTutorsTable from '../_components/TopTutorsTable';

const RANGE_OPTIONS = [
  { key: '7d',  label: '7d',  days: 7 },
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
];

export default function AdminDashboardPage() {
  const { t, formatCurrency } = useI18n();
  const [overview,     setOverview]     = useState(null);
  const [sessions,     setSessions]     = useState([]);
  const [revenue,      setRevenue]      = useState([]);
  const [topCourses,   setTopCourses]   = useState([]);
  const [topTutors,    setTopTutors]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [rangeDays,    setRangeDays]    = useState(30);
  const [refreshing,   setRefreshing]   = useState(false);

  const fetchAll = useCallback(async (manualRefresh = false) => {
    if (manualRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      // Parallel fetch — total dashboard load = max latency of any call.
      const [ovRes, sessRes, revRes, courseRes, tutorRes] = await Promise.all([
        AdminService.metricsOverview(),
        AdminService.metricsSessions({ weeks: 12 }),
        AdminService.metricsRevenue({ months: 12 }),
        AdminService.metricsTopCourses({ days: rangeDays, limit: 10 }),
        AdminService.metricsActiveTutors({ days: rangeDays, limit: 10 }),
      ]);

      if (!ovRes.success)     throw new Error(ovRes.error     || t('admin.dashboard.errors.overview'));
      if (!sessRes.success)   throw new Error(sessRes.error   || t('admin.dashboard.errors.sessions'));
      if (!revRes.success)    throw new Error(revRes.error    || t('admin.dashboard.errors.revenue'));
      if (!courseRes.success) throw new Error(courseRes.error || t('admin.dashboard.errors.topCourses'));
      if (!tutorRes.success)  throw new Error(tutorRes.error  || t('admin.dashboard.errors.topTutors'));

      setOverview({
        sessionsThisWeek:       ovRes.sessionsThisWeek,
        revenueThisMonth:       ovRes.revenueThisMonth,
        activeTutorsLast30Days: ovRes.activeTutorsLast30Days,
        pendingApplications:    ovRes.pendingApplications,
      });
      setSessions(sessRes.series   || []);
      setRevenue(revRes.series     || []);
      setTopCourses(courseRes.items || []);
      setTopTutors(tutorRes.items   || []);
    } catch (e) {
      setError(e.message || t('admin.dashboard.errors.load'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [rangeDays, t]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <div className="flex flex-col gap-5">

      {/* Header / range selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">{t('admin.dashboard.title')}</h2>
          <p className="text-xs text-gray-500">{t('admin.dashboard.cacheNote')}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-white rounded-xl border border-gray-100 p-1 inline-flex gap-1">
            {RANGE_OPTIONS.map(({ key, label, days }) => (
              <button
                key={key}
                type="button"
                onClick={() => setRangeDays(days)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                  rangeDays === days
                    ? 'bg-orange-500 text-white'
                    : 'text-gray-600 hover:bg-orange-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => fetchAll(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            title={t('admin.dashboard.refresh')}
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {t('admin.dashboard.refresh')}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={CalendarDays}
          label={t('admin.dashboard.kpi.sessionsThisWeek')}
          value={overview?.sessionsThisWeek ?? 0}
          sub={t('admin.dashboard.kpi.sessionsThisWeekSub')}
          tone="emerald"
          loading={loading}
        />
        <KpiCard
          icon={DollarSign}
          label={t('admin.dashboard.kpi.revenueThisMonth')}
          value={overview ? formatCurrency(overview.revenueThisMonth, 'COP') : '—'}
          sub={t('admin.dashboard.kpi.revenueThisMonthSub')}
          tone="orange"
          loading={loading}
        />
        <KpiCard
          icon={Users}
          label={t('admin.dashboard.kpi.activeTutors')}
          value={overview?.activeTutorsLast30Days ?? 0}
          sub={t('admin.dashboard.kpi.activeTutorsSub')}
          tone="blue"
          loading={loading}
        />
        <KpiCard
          icon={Inbox}
          label={t('admin.dashboard.kpi.pendingApplications')}
          value={overview?.pendingApplications ?? 0}
          sub={t('admin.dashboard.kpi.pendingApplicationsSub')}
          tone="amber"
          loading={loading}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <SessionsChart series={sessions} loading={loading} />
        <RevenueChart  series={revenue}  loading={loading} />
      </div>

      {/* Rankings row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <TopCoursesTable items={topCourses} loading={loading} days={rangeDays} />
        <TopTutorsTable  items={topTutors}  loading={loading} days={rangeDays} />
      </div>
    </div>
  );
}
