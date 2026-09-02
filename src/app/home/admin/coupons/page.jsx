'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TicketPercent, Plus, Pencil, Trash2, Power, PowerOff, X, Search, ListOrdered, Users, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CouponService } from '../../../services/core/CouponService';
import { useI18n } from '../../../../lib/i18n';
import {
  applyCoupon,
  COUPON_CODE_MAX_LENGTH,
  PERCENT_MIN,
  PERCENT_MAX,
  FIXED_MIN_COP,
  FIXED_MAX_COP,
} from '../../../../lib/payments/coupon-math';
import { tutorPayout } from '../../../../lib/payments/fees';

const STATUS_FILTERS = ['all', 'active', 'scheduled', 'inactive', 'expired', 'exhausted', 'deleted'];

const STATUS_TONE = {
  active:    'bg-green-100 text-green-700',
  scheduled: 'bg-blue-100 text-blue-700',
  inactive:  'bg-gray-100 text-gray-600',
  expired:   'bg-amber-100 text-amber-700',
  exhausted: 'bg-orange-100 text-orange-700',
  deleted:   'bg-rose-100 text-rose-700',
};

const REDEMPTION_TONE = {
  approved: 'bg-green-100 text-green-700',
  reserved: 'bg-blue-100 text-blue-700',
  expired:  'bg-gray-100 text-gray-500',
  released: 'bg-gray-100 text-gray-500',
};

/** Reference session price for the live example in the editor (COP). */
const EXAMPLE_PRICE = 60000;

const EMPTY_FORM = {
  code: '',
  description: '',
  discountType: 'PERCENT',
  discountValue: '',
  absorber: 'CALICO',
  maxRedemptions: '',
  perUserLimit: 1,
  firstSessionOnly: false,
  validFrom: '',
  validUntil: '',
  isActive: true,
};

/** ISO → value for <input type="datetime-local"> (local time, minute precision). */
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value → ISO (or null when empty). */
function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function useDiscountLabel() {
  const { formatCurrency } = useI18n();
  return (coupon) => (
    coupon.discountType === 'PERCENT'
      ? `${coupon.discountValue} %`
      : formatCurrency(coupon.discountValue, 'COP')
  );
}

export default function AdminCouponsPage() {
  const { t, formatCurrency, formatDateTime } = useI18n();
  const discountLabel = useDiscountLabel();
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  // null = closed · 'new' = creating · coupon object = editing
  const [editing, setEditing] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [actingId, setActingId] = useState(null);

  // State is only touched inside the response callback (never synchronously
  // in the effect body), which is what react-hooks/set-state-in-effect wants.
  const load = useCallback(
    () => CouponService.listCoupons({ status, search }).then((res) => {
      if (!res.success) {
        setListError(res.error || t('admin.coupons.errors.load'));
      } else {
        setListError(null);
        setCoupons(res.coupons);
      }
      setLoading(false);
    }),
    [status, search, t],
  );

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (coupon) => {
    setActingId(coupon.id);
    const res = await CouponService.updateCoupon(coupon.id, { isActive: !coupon.isActive });
    if (!res.success) setListError(res.error || t('admin.coupons.errors.save'));
    setActingId(null);
    await load();
  };

  const removeCoupon = async (coupon) => {
    if (!window.confirm(t('admin.coupons.actions.confirmDelete', { code: coupon.code }))) return;
    setActingId(coupon.id);
    const res = await CouponService.deleteCoupon(coupon.id);
    if (!res.success) setListError(res.error || t('admin.coupons.errors.delete'));
    setActingId(null);
    if (detailId === coupon.id) setDetailId(null);
    await load();
  };

  const validityLabel = (c) => {
    const fmt = (v) => formatDateTime(v, { dateStyle: 'medium', timeStyle: 'short' });
    if (c.validFrom && c.validUntil) return t('admin.coupons.validity.range', { from: fmt(c.validFrom), to: fmt(c.validUntil) });
    if (c.validFrom) return t('admin.coupons.validity.from', { date: fmt(c.validFrom) });
    if (c.validUntil) return t('admin.coupons.validity.until', { date: fmt(c.validUntil) });
    return t('admin.coupons.validity.always');
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-orange-100 rounded-xl">
            <TicketPercent className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800">{t('admin.coupons.title')}</h2>
            <p className="text-xs text-gray-500 max-w-2xl">{t('admin.coupons.subtitle')}</p>
          </div>
        </div>
        {!editing && (
          <Button variant="cta" onClick={() => setEditing('new')}>
            <Plus />
            {t('admin.coupons.newCoupon')}
          </Button>
        )}
      </div>

      {listError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
          {listError}
        </p>
      )}

      {editing && (
        <CouponEditor
          coupon={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatus(key)}
              aria-pressed={status === key}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                status === key
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t(`admin.coupons.filters.${key}`)}
            </button>
          ))}
        </div>
        <label className="relative sm:ml-auto">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.coupons.searchPlaceholder')}
            className="pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 uppercase w-full sm:w-56"
          />
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">{t('common.loading')}</p>
      ) : coupons.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-gray-500">
          <TicketPercent className="w-8 h-8 text-gray-300" />
          <p className="text-sm">{t('admin.coupons.empty')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500 bg-gray-50">
                <th className="text-left px-4 py-2">{t('admin.coupons.table.code')}</th>
                <th className="text-left px-4 py-2">{t('admin.coupons.table.discount')}</th>
                <th className="text-left px-4 py-2">{t('admin.coupons.table.absorber')}</th>
                <th className="text-left px-4 py-2">{t('admin.coupons.table.validity')}</th>
                <th className="text-right px-4 py-2">{t('admin.coupons.table.uses')}</th>
                <th className="text-right px-4 py-2">{t('admin.coupons.table.cost')}</th>
                <th className="text-right px-4 py-2">{t('admin.coupons.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => {
                const busy = actingId === c.id;
                const deleted = c.status === 'deleted';
                return (
                  <tr key={c.id} className="border-t border-gray-50 align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-gray-900">{c.code}</span>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_TONE[c.status] || STATUS_TONE.inactive}`}>
                          {t(`admin.coupons.status.${c.status}`)}
                        </span>
                      </div>
                      {c.description && <p className="text-xs text-gray-500 mt-0.5 max-w-xs">{c.description}</p>}
                      <div className="text-[11px] text-gray-400 mt-0.5 flex gap-2 flex-wrap">
                        <span>{t('admin.coupons.uses.perUser', { count: c.perUserLimit })}</span>
                        {c.firstSessionOnly && <span>· {t('admin.coupons.uses.firstOnly')}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-semibold text-gray-800">{discountLabel(c)}</td>
                    <td className="px-4 py-3 text-gray-700">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        c.absorber === 'SHARED' ? 'bg-sky-100 text-sky-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {t(`admin.coupons.absorber.${c.absorber}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{validityLabel(c)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <p className="font-semibold text-gray-800">
                        {c.maxRedemptions != null
                          ? t('admin.coupons.uses.limited', { count: c.stats.approvedCount, max: c.maxRedemptions })
                          : t('admin.coupons.uses.unlimited', { count: c.stats.approvedCount })}
                      </p>
                      {c.stats.activeHolds > 0 && (
                        <p className="text-[11px] text-blue-600">{t('admin.coupons.uses.holds', { count: c.stats.activeHolds })}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-700 whitespace-nowrap">
                      {c.stats.discountTotal > 0 ? (
                        <>
                          <p>{t('admin.coupons.cost.calico', { amount: formatCurrency(c.stats.calicoCost, 'COP') })}</p>
                          {c.stats.tutorCost > 0 && (
                            <p className="text-gray-500">{t('admin.coupons.cost.tutors', { amount: formatCurrency(c.stats.tutorCost, 'COP') })}</p>
                          )}
                        </>
                      ) : t('admin.coupons.cost.none')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <Button variant="outline" size="sm" onClick={() => setDetailId(c.id)}>
                          <ListOrdered />
                          {t('admin.coupons.actions.detail')}
                        </Button>
                        {!deleted && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => toggleActive(c)}
                              aria-label={c.isActive ? t('admin.coupons.actions.deactivate') : t('admin.coupons.actions.activate')}
                            >
                              {c.isActive ? <PowerOff /> : <Power />}
                              {c.isActive ? t('admin.coupons.actions.deactivate') : t('admin.coupons.actions.activate')}
                            </Button>
                            <Button variant="outline" size="icon-sm" aria-label={t('admin.coupons.actions.edit')} disabled={busy} onClick={() => setEditing(c)}>
                              <Pencil />
                            </Button>
                            <Button variant="destructive" size="icon-sm" aria-label={t('admin.coupons.actions.delete')} disabled={busy} onClick={() => removeCoupon(c)}>
                              <Trash2 />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detailId && <CouponDetail id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

/**
 * Create/edit form. Shows a live worked example so the admin sees what the
 * coupon does to a typical session — including when Calico would go negative.
 */
function CouponEditor({ coupon, onClose, onSaved }) {
  const { t, formatCurrency } = useI18n();
  const isNew = !coupon;
  const codeLocked = !isNew && (coupon.stats?.approvedCount > 0 || coupon.stats?.activeHolds > 0);
  const [form, setForm] = useState(
    isNew
      ? EMPTY_FORM
      : {
          code: coupon.code,
          description: coupon.description || '',
          discountType: coupon.discountType,
          discountValue: String(coupon.discountValue),
          absorber: coupon.absorber,
          maxRedemptions: coupon.maxRedemptions == null ? '' : String(coupon.maxRedemptions),
          perUserLimit: coupon.perUserLimit,
          firstSessionOnly: Boolean(coupon.firstSessionOnly),
          validFrom: toLocalInput(coupon.validFrom),
          validUntil: toLocalInput(coupon.validUntil),
          isActive: Boolean(coupon.isActive),
        },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  // Live example on a 60 000 COP session, straight from the shared math.
  const example = useMemo(() => {
    const value = Number(form.discountValue);
    if (!Number.isFinite(value) || value <= 0) return null;
    const pricing = applyCoupon({
      coupon: { discountType: form.discountType, discountValue: value, absorber: form.absorber },
      originalAmount: EXAMPLE_PRICE,
    });
    if (!pricing.applicable) return null;
    const tutor = tutorPayout(pricing.tutorPayoutBase);
    const calico = pricing.finalAmount - tutor; // before the Wompi fee
    return { ...pricing, tutor, calico };
  }, [form.discountType, form.discountValue, form.absorber]);

  const save = async () => {
    if (!form.code.trim() || !form.discountType || !form.discountValue) {
      setError(t('admin.coupons.errors.required'));
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      ...(codeLocked ? {} : { code: form.code.trim().toUpperCase() }),
      description: form.description.trim() || null,
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      absorber: form.absorber,
      maxRedemptions: form.maxRedemptions === '' ? null : Number(form.maxRedemptions),
      perUserLimit: Number(form.perUserLimit) || 1,
      firstSessionOnly: form.firstSessionOnly,
      validFrom: fromLocalInput(form.validFrom),
      validUntil: fromLocalInput(form.validUntil),
      isActive: form.isActive,
    };

    const result = isNew
      ? await CouponService.createCoupon(payload)
      : await CouponService.updateCoupon(coupon.id, payload);

    if (!result.success) {
      setError(result.error || t('admin.coupons.errors.save'));
      setSaving(false);
      return;
    }
    await onSaved();
  };

  const inputClass = 'rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 disabled:bg-gray-50 disabled:text-gray-500';
  const isPercent = form.discountType === 'PERCENT';

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-800">
          {isNew ? t('admin.coupons.createTitle') : t('admin.coupons.editTitle', { code: coupon.code })}
        </h3>
        <Button variant="ghost" size="icon-sm" aria-label={t('admin.coupons.actions.cancel')} onClick={onClose}>
          <X />
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          {t('admin.coupons.fields.code')}
          <input
            type="text"
            maxLength={COUPON_CODE_MAX_LENGTH}
            value={form.code}
            disabled={codeLocked}
            onChange={(e) => set('code', e.target.value.toUpperCase())}
            className={`${inputClass} font-mono uppercase`}
            autoComplete="off"
            spellCheck={false}
          />
          <span className="text-[11px] text-gray-400 font-normal">
            {codeLocked ? t('admin.coupons.fields.codeLocked') : t('admin.coupons.fields.codeHint')}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          {t('admin.coupons.fields.description')}
          <input
            type="text"
            maxLength={300}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            className={inputClass}
          />
        </label>

        <fieldset className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          <legend className="mb-1">{t('admin.coupons.fields.discountType')}</legend>
          <div className="flex gap-4 text-sm text-gray-700">
            <label className="flex items-center gap-2">
              <input type="radio" name="discountType" checked={isPercent} onChange={() => set('discountType', 'PERCENT')} className="accent-[var(--calico-orange)]" />
              {t('admin.coupons.fields.percent')}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="discountType" checked={!isPercent} onChange={() => set('discountType', 'FIXED')} className="accent-[var(--calico-orange)]" />
              {t('admin.coupons.fields.fixed')}
            </label>
          </div>
        </fieldset>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          {t('admin.coupons.fields.discountValue')}
          <input
            type="number"
            inputMode="numeric"
            min={isPercent ? PERCENT_MIN : FIXED_MIN_COP}
            max={isPercent ? PERCENT_MAX : FIXED_MAX_COP}
            step={1}
            value={form.discountValue}
            onChange={(e) => set('discountValue', e.target.value)}
            className={inputClass}
          />
          <span className="text-[11px] text-gray-400 font-normal">
            {isPercent ? t('admin.coupons.fields.percentHint') : t('admin.coupons.fields.fixedHint')}
          </span>
        </label>

        <fieldset className="flex flex-col gap-1 text-xs font-medium text-gray-600 md:col-span-2">
          <legend className="mb-1">{t('admin.coupons.fields.absorber')}</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {['CALICO', 'SHARED'].map((key) => (
              <label
                key={key}
                className={`flex items-start gap-2 rounded-xl border px-3 py-2 cursor-pointer ${
                  form.absorber === key ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="absorber"
                  checked={form.absorber === key}
                  onChange={() => set('absorber', key)}
                  className="mt-1 accent-[var(--calico-orange)]"
                />
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-gray-800">{t(`admin.coupons.absorber.${key}`)}</span>
                  <span className="text-[11px] text-gray-500 font-normal">{t(`admin.coupons.absorber.${key}_hint`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          {t('admin.coupons.fields.maxRedemptions')}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={form.maxRedemptions}
            onChange={(e) => set('maxRedemptions', e.target.value)}
            className={inputClass}
          />
          <span className="text-[11px] text-gray-400 font-normal">{t('admin.coupons.fields.maxRedemptionsHint')}</span>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          {t('admin.coupons.fields.perUserLimit')}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={form.perUserLimit}
            onChange={(e) => set('perUserLimit', e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          {t('admin.coupons.fields.validFrom')}
          <input type="datetime-local" value={form.validFrom} onChange={(e) => set('validFrom', e.target.value)} className={inputClass} />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          {t('admin.coupons.fields.validUntil')}
          <input type="datetime-local" value={form.validUntil} onChange={(e) => set('validUntil', e.target.value)} className={inputClass} />
        </label>
      </div>

      {/* Live example */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-700">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
          {t('admin.coupons.example.title', { price: formatCurrency(EXAMPLE_PRICE, 'COP') })}
        </p>
        {example ? (
          <>
            <p>
              {t('admin.coupons.example.body', {
                discount: formatCurrency(example.discountAmount, 'COP'),
                final: formatCurrency(example.finalAmount, 'COP'),
                tutor: formatCurrency(example.tutor, 'COP'),
                calico: formatCurrency(example.calico, 'COP'),
              })}
            </p>
            {example.calico <= 0 && (
              <p className="mt-1 text-amber-700 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                {t('admin.coupons.example.negative', { price: formatCurrency(EXAMPLE_PRICE, 'COP') })}
              </p>
            )}
          </>
        ) : (
          <p className="text-gray-400">—</p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-gray-100 pt-4">
        <div className="flex items-center gap-5">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.firstSessionOnly}
              onChange={(e) => set('firstSessionOnly', e.target.checked)}
              className="w-4 h-4 accent-[var(--calico-orange)]"
            />
            {t('admin.coupons.fields.firstSessionOnly')}
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set('isActive', e.target.checked)}
              className="w-4 h-4 accent-[var(--calico-orange)]"
            />
            {t('admin.coupons.fields.isActive')}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t('admin.coupons.actions.cancel')}
          </Button>
          <Button variant="cta" onClick={save} disabled={saving}>
            {saving ? t('admin.coupons.actions.saving') : t('admin.coupons.actions.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Traceability panel: who used the coupon, when, and how the money split. */
function CouponDetail({ id, onClose }) {
  const { t, formatCurrency, formatDateTime } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    CouponService.getCoupon(id).then((res) => {
      if (cancelled) return;
      if (!res.success) {
        setData(null);
        setError(res.error || t('admin.coupons.errors.detail'));
      } else {
        setError(null);
        setData(res);
      }
    });
    return () => { cancelled = true; };
  }, [id, t]);

  // `data` may still belong to the previously opened coupon while this one loads.
  const current = data?.coupon?.id === id ? data : null;
  const coupon = current?.coupon;
  const stats = coupon?.stats;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-800">
          {coupon ? t('admin.coupons.detail.title', { code: coupon.code }) : t('admin.coupons.detail.loading')}
        </h3>
        <Button variant="ghost" size="icon-sm" aria-label={t('admin.coupons.actions.cancel')} onClick={onClose}>
          <X />
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</p>
      )}

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {[
            ['uses', stats.approvedCount],
            ['users', stats.uniqueUsers],
            ['discount', formatCurrency(stats.discountTotal, 'COP')],
            ['charged', formatCurrency(stats.chargedTotal, 'COP')],
            ['calicoCost', formatCurrency(stats.calicoCost, 'COP')],
            ['tutorCost', formatCurrency(stats.tutorCost, 'COP')],
          ].map(([key, value]) => (
            <div key={key} className="rounded-xl bg-gray-50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wider text-gray-500">{t(`admin.coupons.detail.summary.${key}`)}</p>
              <p className="text-base font-semibold text-gray-800">{value}</p>
            </div>
          ))}
        </div>
      )}

      {current && current.redemptions.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-gray-500">
          <Users className="w-7 h-7 text-gray-300" />
          <p className="text-sm">{t('admin.coupons.detail.empty')}</p>
        </div>
      )}

      {current && current.redemptions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500 bg-gray-50">
                <th className="text-left px-3 py-2">{t('admin.coupons.detail.columns.user')}</th>
                <th className="text-left px-3 py-2">{t('admin.coupons.detail.columns.date')}</th>
                <th className="text-left px-3 py-2">{t('admin.coupons.detail.columns.status')}</th>
                <th className="text-left px-3 py-2">{t('admin.coupons.detail.columns.session')}</th>
                <th className="text-right px-3 py-2">{t('admin.coupons.detail.columns.original')}</th>
                <th className="text-right px-3 py-2">{t('admin.coupons.detail.columns.discount')}</th>
                <th className="text-right px-3 py-2">{t('admin.coupons.detail.columns.paid')}</th>
                <th className="text-left px-3 py-2">{t('admin.coupons.detail.columns.absorber')}</th>
              </tr>
            </thead>
            <tbody>
              {current.redemptions.map((r) => {
                const muted = r.status === 'expired' || r.status === 'released';
                return (
                  <tr key={r.id} className={`border-t border-gray-50 ${muted ? 'text-gray-400' : 'text-gray-700'}`}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{r.user?.name || '—'}</p>
                      <p className="text-[11px] text-gray-400">{r.user?.email || ''}</p>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">
                      {formatDateTime(r.approvedAt || r.reservedAt, { dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${REDEMPTION_TONE[r.status] || REDEMPTION_TONE.released}`}>
                        {t(`admin.coupons.detail.status.${r.status}`)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.session ? (
                        <>
                          <p>{r.session.course?.name || r.session.course?.code || '—'}</p>
                          <p className="text-[11px] text-gray-400">
                            {formatDateTime(r.session.startTimestamp, { dateStyle: 'medium', timeStyle: 'short' })}
                            {r.session.tutor?.name ? ` · ${r.session.tutor.name}` : ''}
                          </p>
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(r.originalAmount, 'COP')}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">−{formatCurrency(r.discountAmount, 'COP')}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">{formatCurrency(r.finalAmount, 'COP')}</td>
                    <td className="px-3 py-2 text-xs">{t(`admin.coupons.absorber.${r.absorber}`)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
