/**
 * Tailwind class strings shared by the admin event views, so the list, the
 * form and the detail tabs look like one screen. Colours and radii come from
 * the design tokens (src/app/styles/design-tokens.css).
 */

export const CARD = 'bg-white rounded-[var(--radius-xl)] border border-[var(--calico-slate-200)]';

export const INPUT =
  'w-full min-w-0 rounded-[var(--radius-lg)] border border-[var(--calico-slate-200)] bg-white px-3 py-2 text-sm text-[var(--calico-ink)] '
  + 'disabled:bg-[var(--calico-slate-50)] disabled:text-[var(--calico-slate-500)] aria-[invalid=true]:border-[var(--calico-danger)]';

export const LABEL = 'text-xs font-medium text-[var(--calico-slate-700)]';
export const HINT = 'text-xs text-[var(--calico-body-muted)]';
export const FIELD_ERROR = 'text-xs font-medium text-[var(--calico-danger-strong)]';

export const ERROR_BOX = 'text-sm text-[var(--calico-danger-strong)] bg-[var(--calico-danger-soft)] rounded-[var(--radius-lg)] px-4 py-2';
export const SUCCESS_BOX = 'text-sm text-[var(--calico-green-success-dark)] bg-[var(--calico-green-success-soft)] rounded-[var(--radius-lg)] px-4 py-2';
export const INFO_BOX = 'text-sm text-[var(--calico-info-text)] bg-[var(--calico-info-soft)] rounded-[var(--radius-lg)] px-4 py-2';

export const TABLE_WRAP = `${CARD} overflow-x-auto`;
export const TH = 'text-left px-4 py-2 text-xs uppercase tracking-wider font-semibold text-[var(--calico-slate-500)] bg-[var(--calico-slate-50)] whitespace-nowrap';
export const TR = 'border-t border-[var(--calico-slate-100)] align-top';
export const TD = 'px-4 py-3';
export const MUTED = 'text-[var(--calico-body-muted)]';
export const INK = 'text-[var(--calico-ink)]';

export const CHIP = 'inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap';
export const TONE = {
  neutral: 'bg-[var(--calico-slate-100)] text-[var(--calico-slate-700)]',
  info: 'bg-[var(--calico-info-soft)] text-[var(--calico-info-text)]',
  success: 'bg-[var(--calico-green-success-soft)] text-[var(--calico-green-success-dark)]',
  warning: 'bg-[var(--calico-warning-soft)] text-[var(--calico-warning-text)]',
  danger: 'bg-[var(--calico-danger-soft)] text-[var(--calico-danger-strong)]',
};

/**
 * i18n key for a failed AdminEventService call: requireAdminUser rate-limits
 * each admin (30 req/min) with a 429, which gets its own message; anything
 * else gets `fallbackKey`.
 */
export const errorKey = (res, fallbackKey) => (res?.status === 429 ? 'admin.events.errors.RATE_LIMITED' : fallbackKey);

/** Whole percentage of a 0–1 rate (or of part/total), or '—' when undefined. */
export function percent(part, total) {
  if (total === undefined) return Number.isFinite(part) ? `${Math.round(part * 100)} %` : '—';
  return total > 0 ? `${Math.round((part / total) * 100)} %` : '—';
}
