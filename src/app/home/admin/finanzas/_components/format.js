/** Helpers shared by the finance tabs (client-safe). */

import { bogotaLocalToUtc, utcToBogotaLocalInput } from '@/lib/utils/event-format';

export const todayInBogota = () => utcToBogotaLocalInput(new Date()).slice(0, 10);

/** 'YYYY-MM-DD' in Colombia → ISO at 00:00 Bogotá. */
export const dayStartIso = (day) => bogotaLocalToUtc(`${day}T00:00`).toISOString();

/** 'YYYY-MM' → [first day 00:00, first day of next month 00:00) in Bogotá, as ISO. */
export function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { from: dayStartIso(`${ym}-01`), to: dayStartIso(`${next}-01`) };
}

export const currentMonth = () => todayInBogota().slice(0, 7);

/** i18n text of a failed service call: the rule's own text when there is one. */
export function errorText(t, res, fallbackKey = 'admin.finance.errors.generic') {
  if (res?.rule) {
    const key = `admin.finance.rules.${res.rule}`;
    const text = t(key);
    if (text !== key) return text;
  }
  if (res?.status === 429) return t('admin.events.errors.RATE_LIMITED');
  return res?.error || t(fallbackKey);
}
