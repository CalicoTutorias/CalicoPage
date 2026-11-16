'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCcw, UserCheck, Users } from 'lucide-react';
import { AdminService } from '../../../services/core/AdminService';
import { useI18n } from '../../../../lib/i18n';
import DimensionFilter from '../_components/DimensionFilter';
import RetentionKpis from '../_components/RetentionKpis';
import CohortTable from '../_components/CohortTable';
import CourseProfitabilityTable from '../_components/CourseProfitabilityTable';
import KpiCard from '../_components/KpiCard';
import MetricInfo from '../_components/MetricInfo';
import AdminTabs from '../_components/AdminTabs';
import { Button } from '@/components/ui/button';

const RANGE_OPTIONS = [
  { key: '30d',  days: 30 },
  { key: '90d',  days: 90 },
  { key: '180d', days: 180 },
  { key: '365d', days: 365 },
];

// Cohorts are longitudinal — always look back a full year regardless of range.
const COHORT_MONTHS = 12;

export default function AdminGrowthPage() {
  const { t } = useI18n();

  // Segmentation options (loaded once from /api/majors).
  const [careers, setCareers] = useState([]);
  const [dimsLoading, setDimsLoading] = useState(true);

  // Selected filters.
  const [careerId, setCareerId] = useState('');
  const [rangeDays, setRangeDays] = useState(90);

  // Data.
  const [retention,     setRetention]     = useState(null);
  const [active,        setActive]        = useState(null);
  const [cohorts,       setCohorts]       = useState([]);
  const [profitability, setProfitability] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [error,         setError]         = useState('');

  // ─── Load segmentation options ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/majors');
        const json = await res.json();
        if (cancelled || !json?.success) return;
        const majors = json.majors || [];
        const careerList = majors
          .map((m) => ({ id: m.id, name: m.name }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setCareers(careerList);
      } catch {
        /* filter just stays at "all" — non-fatal */
      } finally {
        if (!cancelled) setDimsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Load metrics ───────────────────────────────────────────────────────
  const fetchAll = useCallback(async (manualRefresh = false) => {
    if (manualRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      // `fresh`: «Refrescar» salta la caché de 5 min del backend.
      const fresh = manualRefresh;
      const [retRes, cohRes, profRes] = await Promise.all([
        AdminService.metricsRetention({ days: rangeDays, careerId: careerId || undefined, fresh }),
        AdminService.metricsRetentionCohorts({ months: COHORT_MONTHS, careerId: careerId || undefined, fresh }),
        AdminService.metricsProfitability({ days: rangeDays, fresh }),
      ]);

      if (!retRes.success)  throw new Error(retRes.error  || t('admin.growth.errors.retention'));
      if (!cohRes.success)  throw new Error(cohRes.error  || t('admin.growth.errors.cohorts'));
      if (!profRes.success) throw new Error(profRes.error || t('admin.growth.errors.profitability'));

      setRetention({
        students:          retRes.students,
        repeaters:         retRes.repeaters,
        repeatRate:        retRes.repeatRate,
        sameTutorRate:     retRes.sameTutorRate,
        medianDaysBetween: retRes.medianDaysBetween,
        repeatTicket:      retRes.repeatTicket,
        newTicket:         retRes.newTicket,
      });
      setActive({
        tutors:     retRes.activeTutors,
        students:   retRes.activeStudents,
        windowDays: retRes.windowDays ?? 7,
      });
      setCohorts(cohRes.cohorts || []);
      setProfitability(profRes.items || []);
    } catch (e) {
      setError(e.message || t('admin.growth.errors.load'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [rangeDays, careerId, t]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <div className="flex flex-col gap-5">

      {/* Header / range selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">{t('admin.growth.title')}</h2>
          <p className="text-xs text-gray-500">{t('admin.growth.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* El rango aplica a recompra y rentabilidad; usuarios activos usa
              siempre 7 días y las cohortes 12 meses (dicho en cada bloque). */}
          <span className="hidden sm:inline text-[11px] font-medium text-[var(--calico-slate-400)]">
            {t('admin.growth.rangeScope')}
          </span>
          <AdminTabs
            mode="filter"
            size="sm"
            ariaLabel={t('admin.growth.rangeScope')}
            active={String(rangeDays)}
            onChange={(key) => setRangeDays(Number(key))}
            items={RANGE_OPTIONS.map(({ key, days }) => ({ key: String(days), label: t(`admin.growth.range.${key}`) }))}
          />
          <Button size="sm" variant="outline" onClick={() => fetchAll(true)} disabled={refreshing || loading}>
            <RefreshCcw className={refreshing ? 'animate-spin' : ''} />
            {t('admin.growth.refresh')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Usuarios activos (última vez en la app / last seen) */}
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-700">{t('admin.growth.active.title')}</h3>
          <p className="text-xs text-gray-500">{t('admin.growth.active.subtitle')}</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            icon={UserCheck}
            label={t('admin.growth.active.tutors')}
            value={active?.tutors != null ? active.tutors : '—'}
            sub={t('admin.growth.active.windowSub', { days: active?.windowDays ?? 7 })}
            tone="emerald"
            loading={loading}
            info={<MetricInfo baseKey="admin.growth.info.activeTutors" />}
          />
          <KpiCard
            icon={Users}
            label={t('admin.growth.active.students')}
            value={active?.students != null ? active.students : '—'}
            sub={t('admin.growth.active.windowSub', { days: active?.windowDays ?? 7 })}
            tone="blue"
            loading={loading}
            info={<MetricInfo baseKey="admin.growth.info.activeStudents" />}
          />
        </div>
      </div>

      {/* Recompra */}
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-700">{t('admin.growth.retention.title')}</h3>
          <p className="text-xs text-gray-500">{t('admin.growth.retention.subtitle')}</p>
        </div>
        {/* La carrera (del estudiante) solo segmenta recompra y cohortes. */}
        <DimensionFilter
          careers={careers}
          careerId={careerId}
          onCareerChange={setCareerId}
          loading={dimsLoading}
        />
        <RetentionKpis data={retention} loading={loading} />
      </div>

      {/* Cohortes */}
      <CohortTable cohorts={cohorts} loading={loading} />

      {/* Rentabilidad por materia */}
      <CourseProfitabilityTable items={profitability} loading={loading} days={rangeDays} />
    </div>
  );
}
