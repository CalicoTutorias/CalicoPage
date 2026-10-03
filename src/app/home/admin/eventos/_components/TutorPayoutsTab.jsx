'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AdminEventService } from '@/app/services/core/AdminEventService';
import { useI18n } from '@/lib/i18n';
import { bogotaLocalToUtc, formatEventDate, utcToBogotaLocalInput } from '@/lib/utils/event-format';
import {
  CARD, ERROR_BOX, INK, INPUT, LABEL, MUTED, SUCCESS_BOX, TABLE_WRAP, TD, TH, TR,
} from './ui';

const NOTE_MAX = 300;
const todayInBogota = () => utcToBogotaLocalInput(new Date()).slice(0, 10);
const EMPTY_FORM = () => ({ tutorId: '', amount: '', paidAt: todayInBogota(), note: '' });

/**
 * Manual tutor payouts of one event. Tutors are paid outside Calico; this
 * records who got how much and when (a date in Colombia, stored at noon so it
 * never shifts a day).
 */
export default function TutorPayoutsTab({ eventId, tutors = [] }) {
  const { t, formatCurrency, locale } = useI18n();
  const uid = useId();
  const [payouts, setPayouts] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(
    () => AdminEventService.tutorPayouts(eventId).then((res) => {
      if (res.success) {
        setPayouts(res.payouts || []);
        setLoadError(false);
      } else {
        setLoadError(true);
      }
    }),
    [eventId],
  );

  useEffect(() => { load(); }, [load]);

  const set = (key, value) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  };
  const tutorName = (payout) => payout.tutorName || tutors.find((x) => x.id === payout.tutorId)?.name || '—';

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const amount = Number(form.amount);
    if (!form.tutorId || !Number.isInteger(amount) || amount <= 0 || !form.paidAt) {
      setError(t('admin.events.payouts.form.required'));
      return;
    }
    let paidAt;
    try {
      paidAt = bogotaLocalToUtc(`${form.paidAt}T12:00`).toISOString();
    } catch {
      setError(t('admin.events.payouts.form.required'));
      return;
    }

    setSaving(true);
    setError(null);
    const note = form.note.trim();
    const res = await AdminEventService.createTutorPayout(eventId, {
      tutorId: form.tutorId,
      amount,
      paidAt,
      ...(note ? { note } : {}),
    });
    setSaving(false);
    if (!res.success) {
      const ruleKey = res.rule ? `admin.events.form.errors.${res.rule}` : null;
      const ruleText = ruleKey && t(ruleKey) !== ruleKey ? t(ruleKey) : null;
      setError(ruleText || res.error || t('admin.events.errors.generic'));
      return;
    }
    setForm(EMPTY_FORM());
    setSaved(true);
    await load();
  };

  const total = (payouts || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const field = (name) => `${uid}-${name}`;

  return (
    <div className="flex flex-col gap-5">
      {loadError && <p className={ERROR_BOX}>{t('admin.events.payouts.load')}</p>}
      {!payouts && !loadError && <p className={`text-sm ${MUTED}`}>{t('common.loading')}</p>}

      {payouts && (payouts.length === 0 ? (
        <p className={`text-sm ${MUTED}`}>{t('admin.events.payouts.empty')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className={TABLE_WRAP}>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={TH}>{t('admin.events.payouts.columns.tutor')}</th>
                  <th className={`${TH} text-right`}>{t('admin.events.payouts.columns.amount')}</th>
                  <th className={TH}>{t('admin.events.payouts.columns.paidAt')}</th>
                  <th className={TH}>{t('admin.events.payouts.columns.note')}</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id} className={TR}>
                    <td className={`${TD} ${INK}`}>{tutorName(p)}</td>
                    <td className={`${TD} text-right whitespace-nowrap font-semibold ${INK}`}>{formatCurrency(p.amount, 'COP')}</td>
                    <td className={`${TD} whitespace-nowrap text-xs ${MUTED}`}>{formatEventDate(p.paidAt, locale)}</td>
                    <td className={`${TD} text-xs ${MUTED}`}>{p.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={`text-sm font-semibold self-end ${INK}`}>
            {t('admin.events.payouts.total', { amount: formatCurrency(total, 'COP') })}
          </p>
        </div>
      ))}

      <form noValidate onSubmit={submit} className={`${CARD} p-4 flex flex-col gap-3`}>
        <div>
          <h4 className={`text-sm font-bold ${INK}`}>{t('admin.events.payouts.form.title')}</h4>
          <p className={`text-xs ${MUTED}`}>{t('admin.events.payouts.hint')}</p>
        </div>
        {error && <p role="alert" className={ERROR_BOX}>{error}</p>}
        {saved && <p className={SUCCESS_BOX}>{t('admin.events.payouts.saved')}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <label htmlFor={field('tutor')} className={LABEL}>{t('admin.events.payouts.form.tutor')}</label>
            <select id={field('tutor')} value={form.tutorId} onChange={(e) => set('tutorId', e.target.value)} className={INPUT}>
              <option value="">{t('admin.events.payouts.form.chooseTutor')}</option>
              {tutors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <label htmlFor={field('amount')} className={LABEL}>{t('admin.events.payouts.form.amount')}</label>
            <input
              id={field('amount')}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
              className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <label htmlFor={field('paidAt')} className={LABEL}>{t('admin.events.payouts.form.paidAt')}</label>
            <input
              id={field('paidAt')}
              type="date"
              value={form.paidAt}
              onChange={(e) => set('paidAt', e.target.value)}
              className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-1 min-w-0 sm:col-span-3">
            <label htmlFor={field('note')} className={LABEL}>{t('admin.events.payouts.form.note')}</label>
            <input
              id={field('note')}
              type="text"
              maxLength={NOTE_MAX}
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
              className={INPUT}
            />
          </div>
        </div>
        <Button type="submit" variant="cta" className="self-end" disabled={saving}>
          {saving ? t('admin.events.payouts.form.saving') : t('admin.events.payouts.form.submit')}
        </Button>
      </form>
    </div>
  );
}
