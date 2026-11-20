'use client';

import { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { AvailabilityService } from '../../services/core/AvailabilityService';
import { Button } from '@/components/ui/button';
import {
  BOOKING_NOTICE_OPTIONS,
  DEFAULT_MAX_CONSECUTIVE_HOURS,
  MAX_CONSECUTIVE_HOURS_LIMIT,
} from '../../../lib/payments/batch-discount';

const HOURS_OPTIONS = Array.from({ length: MAX_CONSECUTIVE_HOURS_LIMIT }, (_, i) => i + 1);

/**
 * Tutor profile → "Preferencias de agendamiento": how many consecutive hours
 * a student can book in one reservation and the minimum notice. Saved in the
 * tutor's Schedule (PUT /api/schedules/me). Discounts are Calico's (admin),
 * not the tutor's — nothing about them here.
 * Spec: docs/specs/features/batch-tutorias.md §5
 */
export default function SchedulingPreferencesCard({ t }) {
  const [saved, setSaved] = useState(null); // { maxConsecutiveHours, minBookingNotice }
  const [draft, setDraft] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | idle | saving | saved | error

  useEffect(() => {
    let cancelled = false;
    AvailabilityService.getMySchedule().then((res) => {
      if (cancelled) return;
      const s = res.schedule || {};
      const notice = BOOKING_NOTICE_OPTIONS.includes(s.minBookingNotice) ? s.minBookingNotice : BOOKING_NOTICE_OPTIONS[0];
      const value = {
        maxConsecutiveHours: s.maxConsecutiveHours ?? DEFAULT_MAX_CONSECUTIVE_HOURS,
        minBookingNotice: notice,
      };
      setSaved(value);
      setDraft(value);
      setStatus('idle');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = Boolean(saved && draft)
    && (saved.maxConsecutiveHours !== draft.maxConsecutiveHours || saved.minBookingNotice !== draft.minBookingNotice);

  const save = async () => {
    setStatus('saving');
    const res = await AvailabilityService.updateMySchedule(draft);
    if (res.success) {
      setSaved(draft);
      setStatus('saved');
    } else {
      setStatus('error');
    }
  };

  return (
    <section
      className="bg-white rounded-2xl shadow-sm overflow-hidden"
      aria-labelledby="scheduling-prefs-title"
      data-reveal
      style={{ transitionDelay: '0.12s' }}
    >
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <div className="p-2 rounded-xl bg-[var(--calico-blue-tutor-soft)]">
          <SlidersHorizontal className="w-4 h-4 text-[var(--calico-blue-tutor)]" />
        </div>
        <div className="min-w-0">
          <h2 id="scheduling-prefs-title" className="text-sm font-semibold text-gray-800">
            {t('profile.schedulingPrefs.title')}
          </h2>
          <p className="text-xs text-gray-400">{t('profile.schedulingPrefs.subtitle')}</p>
        </div>
      </div>

      {status === 'loading' || !draft ? (
        <div className="mx-5 mb-5 h-24 bg-gray-50 rounded-xl animate-pulse" />
      ) : (
        <>
          <PreferenceRow
            title={t('profile.schedulingPrefs.maxHours.title')}
            hint={t('profile.schedulingPrefs.maxHours.hint')}
            options={HOURS_OPTIONS}
            value={draft.maxConsecutiveHours}
            format={(h) => t('profile.schedulingPrefs.hoursShort', { count: h })}
            onChange={(v) => { setDraft({ ...draft, maxConsecutiveHours: v }); setStatus('idle'); }}
            disabled={status === 'saving'}
          />
          <PreferenceRow
            title={t('profile.schedulingPrefs.notice.title')}
            hint={t('profile.schedulingPrefs.notice.hint')}
            options={BOOKING_NOTICE_OPTIONS}
            value={draft.minBookingNotice}
            format={(h) => t('profile.schedulingPrefs.hoursShort', { count: h })}
            onChange={(v) => { setDraft({ ...draft, minBookingNotice: v }); setStatus('idle'); }}
            disabled={status === 'saving'}
          />
          {draft.minBookingNotice < 6 && (
            <p className="mx-5 mb-3 rounded-xl bg-[var(--calico-warning-soft)] px-3 py-2 text-xs text-[var(--calico-warning-text)]">
              {t('profile.schedulingPrefs.notice.warning')}
            </p>
          )}
          <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-3">
            <p className="text-xs text-gray-500" role="status" aria-live="polite">
              {status === 'saved' && t('profile.schedulingPrefs.saved')}
              {status === 'error' && <span className="text-[var(--calico-danger)]">{t('profile.schedulingPrefs.error')}</span>}
            </p>
            <Button type="button" variant="tutor" size="sm" onClick={save} disabled={!dirty || status === 'saving'}>
              {status === 'saving' ? t('profile.schedulingPrefs.saving') : t('profile.schedulingPrefs.save')}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function PreferenceRow({ title, hint, options, value, format, onChange, disabled }) {
  return (
    <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        <p className="text-xs text-gray-400">{hint}</p>
      </div>
      <div role="radiogroup" aria-label={title} className="flex shrink-0 gap-1 rounded-[var(--radius-md)] bg-[var(--calico-slate-100)] p-1">
        {options.map((opt) => {
          const active = opt === value;
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(opt)}
              className={`min-h-9 rounded-[var(--radius-sm)] px-3 text-sm transition ${
                active
                  ? 'bg-white font-bold text-[var(--calico-blue-tutor-dark)] shadow-[var(--elev-1)]'
                  : 'font-medium text-[var(--calico-body-muted)] hover:text-[var(--calico-ink)]'
              }`}
            >
              {format(opt)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
