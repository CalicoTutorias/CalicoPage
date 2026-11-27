'use client';

/**
 * Tutor preferences for how students book them (on /tutor/disponibilidad):
 *  - longest session they accept: 1 h, 1 h 30 or 2 h (default 2 h);
 *  - max HOURS of tutoring per day (not number of sessions);
 *  - how many people they accept per session (1 = no group sessions, up to 6).
 * Rules: src/lib/sessions/session-duration.js and group-session.js. Saved
 * through PUT /api/schedules/me.
 */

import { useEffect, useId, useState } from 'react';
import { Clock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { AvailabilityService } from '@/app/services/core/AvailabilityService';
import {
  MAX_HOURS_PER_DAY_LIMIT,
  SESSION_DURATIONS,
  maxHoursPerDayOf,
  maxSessionMinutesOf,
} from '@/lib/sessions/session-duration';
import { GROUP_MAX_SIZE, GROUP_SURCHARGE_PER_HOUR_COP, maxGroupSizeOf } from '@/lib/sessions/group-session';
import { TUTOR_SHARE_RATE } from '@/lib/payments/fees';

const GROUP_SIZES = Array.from({ length: GROUP_MAX_SIZE }, (_, i) => i + 1);

export default function SessionPreferencesCard({ className = '' }) {
  const { t, formatCurrency } = useI18n();
  const uid = useId();
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(null); // { maxSessionMinutes, maxHoursPerDay, maxGroupSize } as stored
  const [maxMinutes, setMaxMinutes] = useState(null);
  const [groupSize, setGroupSize] = useState(GROUP_MAX_SIZE);
  const [hours, setHours] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { tone, text }

  useEffect(() => {
    let active = true;
    AvailabilityService.getMySchedule().then((res) => {
      if (!active) return;
      const current = {
        maxSessionMinutes: maxSessionMinutesOf(res.schedule),
        maxHoursPerDay: maxHoursPerDayOf(res.schedule),
        maxGroupSize: maxGroupSizeOf(res.schedule),
      };
      setSaved(current);
      setMaxMinutes(current.maxSessionMinutes);
      setGroupSize(current.maxGroupSize);
      setHours(String(current.maxHoursPerDay));
      setLoaded(true);
    });
    return () => { active = false; };
  }, []);

  const hoursNum = Number(hours);
  const hoursValid = Number.isInteger(hoursNum) && hoursNum >= 1 && hoursNum <= MAX_HOURS_PER_DAY_LIMIT;
  const dirty = saved && (
    maxMinutes !== saved.maxSessionMinutes || hoursNum !== saved.maxHoursPerDay || groupSize !== saved.maxGroupSize
  );

  const save = async (e) => {
    e.preventDefault();
    if (!hoursValid || !dirty) return;
    setSaving(true);
    setMessage(null);
    const res = await AvailabilityService.updateMySchedule({
      maxSessionMinutes: maxMinutes, maxHoursPerDay: hoursNum, maxGroupSize: groupSize,
    });
    setSaving(false);
    if (res.success) {
      setSaved({ maxSessionMinutes: maxMinutes, maxHoursPerDay: hoursNum, maxGroupSize: groupSize });
      setMessage({ tone: 'success', text: t('sessionPreferences.saved') });
    } else {
      setMessage({ tone: 'error', text: t('sessionPreferences.error') });
    }
  };

  return (
    <section
      aria-labelledby={`${uid}-title`}
      className={`rounded-2xl border border-[var(--calico-blue-tutor-soft)] bg-white px-4 py-4 sm:px-5 shadow-sm ${className}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Clock className="w-4 h-4 text-[var(--calico-blue-tutor)]" aria-hidden="true" />
        <h2 id={`${uid}-title`} className="text-base font-semibold text-gray-900">{t('sessionPreferences.title')}</h2>
      </div>
      <p className="text-sm text-gray-600 mb-4">{t('sessionPreferences.description')}</p>

      {!loaded ? (
        <p className="text-sm text-gray-400">{t('sessionPreferences.loading')}</p>
      ) : (
        <form onSubmit={save} className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2 min-w-0">
            <legend className="text-sm font-medium text-gray-800 mb-1">{t('sessionPreferences.maxDuration')}</legend>
            <div className="flex flex-wrap gap-2">
              {SESSION_DURATIONS.map((minutes) => (
                <Button
                  key={minutes}
                  type="button"
                  size="sm"
                  variant={maxMinutes === minutes ? 'tutor' : 'outline'}
                  aria-pressed={maxMinutes === minutes}
                  onClick={() => setMaxMinutes(minutes)}
                >
                  {t(`sessionPreferences.upTo.${minutes}`)}
                </Button>
              ))}
            </div>
            <p className="text-xs text-gray-500">{t('sessionPreferences.maxDurationHint')}</p>
          </fieldset>

          <div className="flex flex-col gap-1 sm:max-w-xs">
            <label htmlFor={`${uid}-hours`} className="text-sm font-medium text-gray-800">{t('sessionPreferences.maxHours')}</label>
            <input
              id={`${uid}-hours`}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_HOURS_PER_DAY_LIMIT}
              step={1}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              aria-invalid={!hoursValid}
              aria-describedby={`${uid}-hours-hint`}
              className="w-full rounded-[var(--control-radius)] border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[var(--calico-blue-tutor)]"
            />
            <p id={`${uid}-hours-hint`} className={`text-xs ${hoursValid ? 'text-gray-500' : 'text-[var(--calico-danger-strong)]'}`}>
              {hoursValid ? t('sessionPreferences.maxHoursHint') : t('sessionPreferences.maxHoursInvalid', { max: MAX_HOURS_PER_DAY_LIMIT })}
            </p>
          </div>

          <fieldset className="flex flex-col gap-2 min-w-0">
            <legend className="text-sm font-medium text-gray-800 mb-1 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-[var(--calico-blue-tutor)]" aria-hidden="true" />
              {t('sessionPreferences.group.label')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {GROUP_SIZES.map((size) => (
                <Button
                  key={size}
                  type="button"
                  size="sm"
                  variant={groupSize === size ? 'tutor' : 'outline'}
                  aria-pressed={groupSize === size}
                  onClick={() => setGroupSize(size)}
                >
                  {size === 1 ? t('sessionPreferences.group.individualOnly') : t('sessionPreferences.group.upTo', { count: size })}
                </Button>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              {t('sessionPreferences.group.hint', {
                surcharge: formatCurrency(GROUP_SURCHARGE_PER_HOUR_COP),
                share: formatCurrency(Math.round(GROUP_SURCHARGE_PER_HOUR_COP * TUTOR_SHARE_RATE)),
              })}
            </p>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="tutor" disabled={saving || !dirty || !hoursValid}>
              {saving ? t('sessionPreferences.saving') : t('sessionPreferences.save')}
            </Button>
            {message && (
              <p
                role={message.tone === 'error' ? 'alert' : 'status'}
                className={`text-sm ${message.tone === 'error' ? 'text-[var(--calico-danger-strong)]' : 'text-[var(--calico-green-success-dark)]'}`}
              >
                {message.text}
              </p>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
