'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '../../../../../lib/i18n';

export const COMPLEXITIES = ['Introductory', 'Foundational', 'Challenging'];

const MAX_ALIASES = 30;
const MAX_ALIAS_LENGTH = 60;

/** "40.000", "40,000" o "40000" → 40000; cualquier otra cosa → NaN. */
export function parseCopPrice(value) {
  const normalized = String(value ?? '').trim().replace(/[.,\s]/g, '');
  return /^\d+$/.test(normalized) ? Number(normalized) : Number.NaN;
}

/** Texto del textarea (líneas o comas) → lista limpia y sin repetidos. */
export function parseAliases(text) {
  const seen = new Set();
  const result = [];
  for (const raw of String(text ?? '').split(/[\n,]/)) {
    const alias = raw.trim().replace(/\s+/g, ' ');
    const key = alias.toLowerCase();
    if (!alias || seen.has(key)) continue;
    seen.add(key);
    result.push(alias);
  }
  return result;
}

function toFormState(course) {
  return {
    code: course?.code ?? '',
    name: course?.name ?? '',
    complexity: course?.complexity ?? 'Introductory',
    basePrice: course?.basePrice != null && Number(course.basePrice) > 0 ? String(Number(course.basePrice)) : '',
    careerId: course?.careerId ?? '',
    aliasesText: Array.isArray(course?.aliases) ? course.aliases.join('\n') : '',
  };
}

/**
 * Valida el formulario y devuelve el payload normalizado, o la clave i18n
 * del primer error. Mismas reglas que el Zod de /api/admin/courses.
 */
export function buildCoursePayload(form) {
  const code = form.code.trim().toUpperCase();
  if (code.length < 2 || code.length > 20 || /\s/.test(code)) return { error: 'admin.courses.errors.invalidCode' };

  const name = form.name.trim();
  if (name.length < 3 || name.length > 160) return { error: 'admin.courses.errors.invalidName' };

  if (!form.careerId) return { error: 'admin.courses.errors.careerRequired' };

  const basePrice = parseCopPrice(form.basePrice);
  if (!Number.isSafeInteger(basePrice) || basePrice <= 0 || basePrice > 1_000_000) {
    return { error: 'admin.courses.errors.invalidPrice' };
  }

  const aliases = parseAliases(form.aliasesText);
  if (aliases.length > MAX_ALIASES || aliases.some((alias) => alias.length > MAX_ALIAS_LENGTH)) {
    return { error: 'admin.courses.errors.invalidAliases' };
  }

  return {
    payload: { code, name, complexity: form.complexity, careerId: form.careerId, basePrice, aliases },
  };
}

/** Solo los campos que cambiaron respecto al curso original (para el PATCH). */
export function diffCoursePayload(course, payload) {
  const changes = {};
  if (payload.code !== course.code) changes.code = payload.code;
  if (payload.name !== course.name) changes.name = payload.name;
  if (payload.complexity !== course.complexity) changes.complexity = payload.complexity;
  if (payload.careerId !== course.careerId) changes.careerId = payload.careerId;
  if (payload.basePrice !== Number(course.basePrice)) changes.basePrice = payload.basePrice;
  const current = Array.isArray(course.aliases) ? course.aliases : [];
  if (payload.aliases.length !== current.length || payload.aliases.some((alias, i) => alias !== current[i])) {
    changes.aliases = payload.aliases;
  }
  return changes;
}

const fieldClass = 'mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm';
const labelClass = 'text-sm font-medium text-gray-700';

/**
 * Formulario de materia en un modal. Tres modos:
 *   - create  → crear materia nueva
 *   - edit    → editar `course` (nombre, código, aliases, complejidad, carrera, precio)
 *   - approve → aprobar una sugerencia; `course` trae código y nombre sugeridos.
 *               Sin aliases: el endpoint de aprobación no los recibe.
 *
 * El padre lo monta solo mientras está abierto (con `key` por curso), así el
 * formulario arranca limpio en cada apertura. `onSubmit(payload)` devuelve
 * `{ error?: string }`: con error el modal lo muestra y sigue abierto; si todo
 * sale bien el padre lo desmonta.
 */
export default function CourseFormModal({ mode, course, careers, onSubmit, onClose }) {
  const { t } = useI18n();
  const titleId = useId();
  const firstFieldRef = useRef(null);
  const [form, setForm] = useState(() => toFormState(course));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const latest = useRef({ onClose, busy });
  useEffect(() => {
    latest.current = { onClose, busy };
  });

  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !latest.current.busy) latest.current.onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const showAliases = mode !== 'approve';
  const titleKey = { create: 'createTitle', edit: 'editTitle', approve: 'approveTitle' }[mode];
  const submitKey = { create: 'create', edit: 'save', approve: 'approve' }[mode];

  const update = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const { payload, error: validationError } = buildCoursePayload(
      showAliases ? form : { ...form, aliasesText: '' },
    );
    if (validationError) {
      setError(t(validationError));
      return;
    }
    if (!showAliases) delete payload.aliases;

    setBusy(true);
    setError('');
    const result = await onSubmit(payload);
    setBusy(false);
    if (result?.error) setError(result.error);
  };

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-[var(--modal-backdrop)] p-4"
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[var(--modal-max-width)] max-h-[90vh] overflow-y-auto bg-white rounded-[var(--modal-radius)] shadow-[var(--elev-modal)] p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-base font-bold text-[var(--calico-ink)]">
          {t(`admin.courses.modal.${titleKey}`)}
        </h2>
        {mode === 'approve' && (
          <p className="mt-1 text-xs text-gray-500">{t('admin.courses.modal.approveHint')}</p>
        )}

        <form onSubmit={handleSubmit} noValidate className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className={labelClass}>
            {t('admin.courses.fields.code')}
            <input ref={firstFieldRef} required value={form.code} onChange={update('code')} className={`${fieldClass} uppercase`} />
          </label>
          <label className={labelClass}>
            {t('admin.courses.fields.complexity')}
            <select value={form.complexity} onChange={update('complexity')} className={fieldClass}>
              {COMPLEXITIES.map((value) => (
                <option key={value} value={value}>{t(`admin.courses.complexity.${value}`)}</option>
              ))}
            </select>
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            {t('admin.courses.fields.name')}
            <input required value={form.name} onChange={update('name')} className={fieldClass} />
          </label>
          <label className={labelClass}>
            {t('admin.courses.fields.career')}
            <select required value={form.careerId} onChange={update('careerId')} className={fieldClass}>
              <option value="" disabled>{t('admin.courses.fields.careerPlaceholder')}</option>
              {careers.map((career) => (
                <option key={career.id} value={career.id}>{career.name}</option>
              ))}
            </select>
          </label>
          <div>
            <label className={labelClass}>
              {t('admin.courses.fields.basePrice')}
              <input
                required
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-describedby={`${titleId}-price-hint`}
                value={form.basePrice}
                onChange={update('basePrice')}
                className={fieldClass}
              />
            </label>
            <p id={`${titleId}-price-hint`} className="mt-1 text-xs text-gray-500">
              {t('admin.courses.fields.basePriceHint')}
            </p>
          </div>
          {showAliases && (
            <div className="sm:col-span-2">
              <label className={labelClass}>
                {t('admin.courses.fields.aliases')}
                <textarea
                  rows={3}
                  value={form.aliasesText}
                  onChange={update('aliasesText')}
                  aria-describedby={`${titleId}-aliases-hint`}
                  className={fieldClass}
                />
              </label>
              <p id={`${titleId}-aliases-hint`} className="mt-1 text-xs text-gray-500">
                {t('admin.courses.fields.aliasesHint')}
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="sm:col-span-2 text-sm text-[var(--calico-danger-strong)] bg-[var(--calico-danger-soft)] rounded-[var(--radius-lg)] px-3 py-2">
              {error}
            </p>
          )}

          <div className="sm:col-span-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              {t('admin.courses.modal.cancel')}
            </Button>
            <Button type="submit" variant="cta" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {busy ? t('admin.courses.modal.saving') : t(`admin.courses.modal.${submitKey}`)}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
