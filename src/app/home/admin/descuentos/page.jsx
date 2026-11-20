'use client';

import { useEffect, useMemo, useState } from 'react';
import { Layers, Plus, Trash2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BatchDiscountService } from '../../../services/core/BatchDiscountService';
import AdminService from '../../../services/core/AdminService';
import { useI18n } from '../../../../lib/i18n';
import routes from '../../../../routes';
import {
  BATCH_ABSORBERS,
  DEFAULT_BATCH_CONFIG,
  MAX_TIERS,
  TIER_MAX_PERCENT,
  computeBatchPricing,
  combineBatchAndCoupon,
  validateTiers,
} from '../../../../lib/payments/batch-discount';
import { tutorPayout, wompiFee } from '../../../../lib/payments/fees';

const SIM_HOURS = [1, 2, 3, 4];

/** Simulation row for one block length (what each party gets), via fees.js. */
function simulate({ pricePerHour, hours, config, absorber }) {
  const batch = computeBatchPricing({ pricePerHour, hours, config: { ...config, isActive: true } });
  const pricing = combineBatchAndCoupon({ batch, absorber, couponPricing: null });
  const tutor = Math.round(tutorPayout(pricing.tutorPayoutBase));
  const net = Math.round(pricing.finalAmount - tutor - wompiFee(pricing.finalAmount));
  return { hours, paid: pricing.finalAmount, saved: pricing.batchDiscountAmount, tutor, net };
}

const KNOWN_ERRORS = new Set([
  'LOAD', 'GENERIC', 'VALIDATION_ERROR', 'INVALID_ABSORBER',
  'TIERS_LENGTH', 'FIRST_TIER_NOT_ZERO', 'TIER_OUT_OF_RANGE', 'TIERS_DECREASING',
]);

/**
 * Admin · Descuentos por bloque (/home/admin/descuentos).
 * Calico's discount for booking consecutive hours with a tutor: per-hour
 * tiers, who absorbs it (same model as coupons), whether it combines with
 * coupons and applies to manual sessions. Saved via PUT
 * /api/admin/batch-discount (requireAdminUser + audit log).
 * Spec: docs/specs/features/batch-tutorias.md §7b
 */
export default function AdminBatchDiscountPage() {
  const { t, formatCurrency, formatDate } = useI18n();
  const [config, setConfig] = useState(null);
  const [saved, setSaved] = useState(null);
  const [changes, setChanges] = useState([]);
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [status, setStatus] = useState('loading'); // loading | idle | saving | saved | error
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([BatchDiscountService.getConfig(), AdminService.listCourses()]).then(([cfg, list]) => {
      if (cancelled) return;
      const value = cfg.success ? cfg.config : { ...DEFAULT_BATCH_CONFIG, tiers: [...DEFAULT_BATCH_CONFIG.tiers] };
      setConfig(value);
      setSaved(value);
      setChanges(cfg.changes || []);
      const priced = (list?.courses || []).filter((c) => Number(c.basePrice) > 0);
      setCourses(priced);
      setCourseId(priced[0]?.id || '');
      setStatus(cfg.success ? 'idle' : 'error');
      if (!cfg.success) setError('LOAD');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const tierError = config ? validateTiers(config.tiers) : null;
  const dirty = JSON.stringify(config) !== JSON.stringify(saved);
  const course = courses.find((c) => c.id === courseId) || null;
  const pricePerHour = Number(course?.basePrice) || 0;

  const simulation = useMemo(() => {
    if (!config || tierError || !pricePerHour) return null;
    const rows = SIM_HOURS.map((hours) => simulate({ pricePerHour, hours, config, absorber: config.absorber }));
    const calicoRows = SIM_HOURS.map((hours) => simulate({ pricePerHour, hours, config, absorber: BATCH_ABSORBERS.CALICO }));
    // Warn when, absorbed by Calico, a longer block nets less than a shorter one.
    const worse = calicoRows.findIndex((r, i) => i > 1 && r.net < calicoRows[1].net);
    return { rows, warning: worse > 0 ? { long: calicoRows[worse], short: calicoRows[1] } : null };
  }, [config, tierError, pricePerHour]);

  if (status === 'loading' || !config) {
    return <div className="h-64 rounded-2xl bg-white animate-pulse" />;
  }

  const setTier = (index, value) => {
    const tiers = [...config.tiers];
    tiers[index] = value === '' ? '' : Math.round(Number(value));
    setConfig({ ...config, tiers });
    setStatus('idle');
  };
  const update = (patch) => {
    setConfig({ ...config, ...patch });
    setStatus('idle');
  };

  const save = async () => {
    setStatus('saving');
    setError(null);
    const res = await BatchDiscountService.saveConfig({
      isActive: config.isActive,
      tiers: config.tiers.map(Number),
      absorber: config.absorber,
      stacksWithCoupons: config.stacksWithCoupons,
      appliesToManual: config.appliesToManual,
    });
    if (res.success) {
      setSaved(res.config);
      setConfig(res.config);
      setStatus('saved');
      const refreshed = await BatchDiscountService.getConfig();
      if (refreshed.success) setChanges(refreshed.changes || []);
    } else {
      setStatus('error');
      setError(res.error || 'GENERIC');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-[var(--calico-orange-soft)] shrink-0">
            <Layers className="w-5 h-5 text-[var(--calico-orange-text)]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-800">{t('admin.batchDiscount.title')}</h2>
            <p className="text-xs text-gray-500 max-w-2xl">{t('admin.batchDiscount.subtitle')}</p>
          </div>
        </div>
        <Toggle
          checked={config.isActive}
          onChange={(v) => update({ isActive: v })}
          label={config.isActive ? t('admin.batchDiscount.active') : t('admin.batchDiscount.inactive')}
        />
      </div>

      {error && (
        <p className="text-sm text-[var(--calico-danger)] bg-[var(--calico-danger-soft)] rounded-xl px-4 py-2" role="alert">
          {t(`admin.batchDiscount.errors.${KNOWN_ERRORS.has(error) ? error : 'GENERIC'}`)}
        </p>
      )}

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <div className="flex flex-col gap-5 flex-1 min-w-0">
          {/* Tiers */}
          <Card>
            <h3 className="text-base font-bold text-gray-800">{t('admin.batchDiscount.tiers.title')}</h3>
            <p className="text-xs text-gray-500">{t('admin.batchDiscount.tiers.hint')}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    <th className="py-2 pr-3">{t('admin.batchDiscount.tiers.hour')}</th>
                    <th className="py-2 pr-3">{t('admin.batchDiscount.tiers.percent')}</th>
                    <th className="py-2 pr-3">{t('admin.batchDiscount.tiers.example', { price: pricePerHour ? formatCurrency(pricePerHour) : '—' })}</th>
                    <th className="py-2" aria-label={t('admin.batchDiscount.tiers.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {config.tiers.map((tier, i) => {
                    const isLast = i === config.tiers.length - 1;
                    const label = isLast && i > 0
                      ? t('admin.batchDiscount.tiers.hourOnwards', { n: i + 1 })
                      : t('admin.batchDiscount.tiers.hourN', { n: i + 1 });
                    const example = pricePerHour ? Math.round(pricePerHour * (1 - (Number(tier) || 0) / 100)) : null;
                    return (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-2.5 pr-3 font-semibold text-gray-800">{label}</td>
                        <td className="py-2.5 pr-3">
                          <label className="sr-only" htmlFor={`tier-${i}`}>{label}</label>
                          <div className="flex items-center gap-2">
                            <input
                              id={`tier-${i}`}
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={TIER_MAX_PERCENT}
                              step={1}
                              value={tier}
                              disabled={i === 0}
                              onChange={(e) => setTier(i, e.target.value)}
                              className="w-24 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 disabled:bg-gray-50 disabled:text-gray-400"
                            />
                            <span className="text-gray-500">{i === 0 ? t('admin.batchDiscount.tiers.fixed') : '%'}</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-gray-500">{example !== null ? formatCurrency(example) : '—'}</td>
                        <td className="py-2.5 text-right">
                          {isLast && i > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => update({ tiers: config.tiers.slice(0, -1) })}
                              aria-label={t('admin.batchDiscount.tiers.remove')}
                            >
                              <Trash2 />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {config.tiers.length < MAX_TIERS && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start text-[var(--calico-orange-text)]"
                onClick={() => update({ tiers: [...config.tiers, Number(config.tiers[config.tiers.length - 1]) || 0] })}
              >
                <Plus /> {t('admin.batchDiscount.tiers.add', { n: config.tiers.length + 1 })}
              </Button>
            )}
            <p className={`text-[11px] ${tierError ? 'text-[var(--calico-danger)] font-semibold' : 'text-gray-500'}`}>
              {tierError ? t(`admin.batchDiscount.errors.${tierError}`) : t('admin.batchDiscount.tiers.rules', { max: TIER_MAX_PERCENT })}
            </p>
          </Card>

          {/* Absorber */}
          <Card>
            <h3 className="text-base font-bold text-gray-800">{t('admin.batchDiscount.absorber.title')}</h3>
            <div role="radiogroup" aria-label={t('admin.batchDiscount.absorber.title')} className="grid gap-3 sm:grid-cols-2">
              {[BATCH_ABSORBERS.SHARED, BATCH_ABSORBERS.CALICO].map((value) => {
                const active = config.absorber === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => update({ absorber: value })}
                    className={`flex gap-3 rounded-xl border p-4 text-left transition ${
                      active
                        ? 'border-[var(--calico-orange)] bg-[var(--calico-orange-soft)]'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 size-4 shrink-0 rounded-full border-2 ${active ? 'border-[var(--calico-orange)] bg-white ring-4 ring-inset ring-[var(--calico-orange)]' : 'border-gray-300'}`}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-gray-800">{t(`admin.coupons.absorber.${value}`)}</span>
                      <span className="block text-xs text-gray-500">{t(`admin.coupons.absorber.${value}_hint`)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Rules */}
          <Card>
            <h3 className="text-base font-bold text-gray-800">{t('admin.batchDiscount.rules.title')}</h3>
            <RuleRow
              title={t('admin.batchDiscount.rules.stacks')}
              hint={t('admin.batchDiscount.rules.stacksHint')}
              checked={config.stacksWithCoupons}
              onChange={(v) => update({ stacksWithCoupons: v })}
            />
            <RuleRow
              title={t('admin.batchDiscount.rules.manual')}
              hint={t('admin.batchDiscount.rules.manualHint')}
              checked={config.appliesToManual}
              onChange={(v) => update({ appliesToManual: v })}
            />
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="cta" onClick={save} disabled={!dirty || Boolean(tierError) || status === 'saving'}>
              {status === 'saving' ? t('admin.batchDiscount.saving') : t('admin.batchDiscount.save')}
            </Button>
            <p className="text-xs text-gray-500" role="status" aria-live="polite">
              {status === 'saved' ? t('admin.batchDiscount.saved') : t('admin.batchDiscount.saveHint')}
            </p>
          </div>
        </div>

        {/* Simulation + history */}
        <div className="flex flex-col gap-5 xl:w-[26rem] shrink-0">
          <Card>
            <h3 className="text-base font-bold text-gray-800">{t('admin.batchDiscount.simulation.title')}</h3>
            <label className="sr-only" htmlFor="sim-course">{t('admin.batchDiscount.simulation.course')}</label>
            <select
              id="sim-course"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {formatCurrency(Number(c.basePrice))}/h
                </option>
              ))}
            </select>
            {simulation ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      <th className="py-1.5 pr-2">{t('admin.batchDiscount.simulation.block')}</th>
                      <th className="py-1.5 pr-2">{t('admin.batchDiscount.simulation.paid')}</th>
                      <th className="py-1.5 pr-2">{t('admin.batchDiscount.simulation.saved')}</th>
                      <th className="py-1.5 pr-2">{t('admin.batchDiscount.simulation.tutor')}</th>
                      <th className="py-1.5 text-right">{t('admin.batchDiscount.simulation.calico')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulation.rows.map((r) => (
                      <tr key={r.hours} className="border-t border-gray-100">
                        <td className="py-2 pr-2 font-semibold text-gray-800">{r.hours} h</td>
                        <td className="py-2 pr-2">{formatCurrency(r.paid)}</td>
                        <td className="py-2 pr-2 font-semibold text-[var(--calico-green)]">{r.saved ? formatCurrency(r.saved) : '—'}</td>
                        <td className="py-2 pr-2">{formatCurrency(r.tutor)}</td>
                        <td className="py-2 text-right">{formatCurrency(r.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-gray-500">{t('admin.batchDiscount.simulation.empty')}</p>
            )}
            <p className="text-[11px] text-gray-500">{t('admin.batchDiscount.simulation.note')}</p>
            {simulation?.warning && (
              <p className="flex gap-2 rounded-xl bg-[var(--calico-warning-soft)] px-3 py-2 text-xs font-medium text-[var(--calico-warning-text)]">
                <AlertTriangle className="size-4 shrink-0" />
                {t('admin.batchDiscount.simulation.warning', {
                  long: simulation.warning.long.hours,
                  longNet: formatCurrency(simulation.warning.long.net),
                  short: simulation.warning.short.hours,
                  shortNet: formatCurrency(simulation.warning.short.net),
                })}
              </p>
            )}
          </Card>

          <Card>
            <h3 className="text-base font-bold text-gray-800">{t('admin.batchDiscount.history.title')}</h3>
            {changes.length === 0 ? (
              <p className="text-xs text-gray-500">{t('admin.batchDiscount.history.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {changes.map((c) => (
                  <li key={c.id}>
                    <p className="text-sm font-semibold text-gray-800">{describeChange(c, t)}</p>
                    <p className="text-[11px] text-gray-500">
                      {formatDate(c.createdAt)}{c.adminName ? ` · ${c.adminName}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Link href={routes.ADMIN_AUDIT} className="text-sm font-semibold text-[var(--calico-orange-text)] hover:text-[var(--calico-orange-text-hover)]">
              {t('admin.batchDiscount.history.viewAll')}
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}

function describeChange(change, t) {
  const before = change.before || {};
  const after = change.after || {};
  if (before.isActive !== after.isActive) {
    return after.isActive ? t('admin.batchDiscount.history.activated') : t('admin.batchDiscount.history.deactivated');
  }
  if (JSON.stringify(before.tiers) !== JSON.stringify(after.tiers)) {
    return t('admin.batchDiscount.history.tiers', { before: (before.tiers || []).join(' / '), after: (after.tiers || []).join(' / ') });
  }
  if (before.absorber !== after.absorber) {
    return t('admin.batchDiscount.history.absorber', { value: t(`admin.coupons.absorber.${after.absorber}`) });
  }
  return t('admin.batchDiscount.history.rules');
}

function Card({ children }) {
  return <section className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">{children}</section>;
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-3 text-sm font-semibold text-gray-700 cursor-pointer select-none">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${checked ? 'bg-[var(--calico-orange)]' : 'bg-[var(--calico-slate-300)]'}`}
      >
        <span className={`inline-block size-[1.125rem] rounded-full bg-white shadow transition ${checked ? 'translate-x-[1.375rem]' : 'translate-x-[0.1875rem]'}`} />
      </button>
    </label>
  );
}

function RuleRow({ title, hint, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-gray-100 pt-3 first-of-type:border-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        <p className="text-xs text-gray-500">{hint}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}
