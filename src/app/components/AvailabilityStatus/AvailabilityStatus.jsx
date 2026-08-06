'use client';

/**
 * Presentación compartida del semáforo de disponibilidad. Lo consumen tanto el
 * panel de administración (lista y detalle de tutores) como la zona de tutor
 * (perfil y aviso), para que un mismo estado se vea igual en todas partes.
 *
 *   ⚪ not_configured — el tutor nunca ha configurado disponibilidad
 *   🔴 none           — la tiene configurada, pero 0 h en la ventana
 *   🟡 low            — por debajo del mínimo
 *   🟢 ok             — mínimo alcanzado
 *
 * El estado NO depende de Google Calendar: da igual si las horas se pusieron a
 * mano o sincronizadas. El objeto `availability` lo calcula el servidor
 * (`tutor-availability-status.service.js`), incluido el umbral, para que la UI
 * no duplique reglas de negocio.
 */

import { useI18n } from '../../../lib/i18n';

export const AVAILABILITY_COLORS = {
  not_configured: { color: 'var(--calico-slate-400)',     ring: 'var(--calico-slate-200)' },
  none:           { color: 'var(--calico-danger)',        ring: 'var(--calico-danger-soft)' },
  low:            { color: 'var(--calico-warning-text)',  ring: 'var(--calico-warning-soft)' },
  ok:             { color: 'var(--calico-green-success)', ring: 'var(--calico-green-success-soft)' },
};

export function colorsFor(status) {
  return AVAILABILITY_COLORS[status] ?? AVAILABILITY_COLORS.not_configured;
}

/** Una sola decimal, y sin ".0" cuando el número es redondo. */
export function formatHours(hours) {
  const value = Number(hours ?? 0);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Texto del tooltip. Menciona la fuente (manual / Google / ambas) solo como
 * información: no cambia el estado.
 */
function useTooltip(availability) {
  const { t } = useI18n();
  const status = availability?.status ?? 'not_configured';

  if (status === 'not_configured') return t('availability.tooltip.notConfigured');

  const base = t('availability.tooltip.hours', {
    hours: formatHours(availability.hours),
    days: availability.windowDays,
    threshold: availability.thresholdHours,
  });

  const sources = availability.sources ?? [];
  const sourceKey = sources.includes('manual') && sources.includes('calendar_sync')
    ? 'both'
    : sources.includes('calendar_sync')
      ? 'google'
      : 'manual';

  return `${base} · ${t(`availability.source.${sourceKey}`)}`;
}

/**
 * Punto de color. `showLabel` añade el nombre del estado al lado.
 * El color por sí solo no es accesible: el estado va en `aria-label` y `title`.
 */
export default function AvailabilityDot({ availability, showLabel = false, size = 'sm' }) {
  const { t } = useI18n();

  const status = availability?.status ?? 'not_configured';
  const { color, ring } = colorsFor(status);
  const label = t(`availability.status.${status}`);
  const tooltip = useTooltip(availability);
  const dotSize = size === 'lg' ? 'w-3 h-3' : 'w-2.5 h-2.5';

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={`${label} — ${tooltip}`}
      role="img"
      aria-label={`${label}. ${tooltip}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block ${dotSize} rounded-full flex-shrink-0`}
        style={{ backgroundColor: color, boxShadow: `0 0 0 3px ${ring}` }}
      />
      {showLabel && (
        <span className="text-[11px] font-medium" style={{ color: 'var(--calico-body-muted)' }}>
          {label}
        </span>
      )}
    </span>
  );
}

/**
 * Píldora para el perfil del tutor: punto + estado + horas. Es la respuesta a
 * "¿estoy activo y recibiendo tutorías?" de un vistazo.
 */
export function AvailabilityBadge({ availability, className = '' }) {
  const { t } = useI18n();
  if (!availability) return null;

  const { color, ring } = colorsFor(availability.status);
  const isOk = availability.status === 'ok';

  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${className}`}
      style={{ backgroundColor: ring, color }}
      title={t('availability.badge.tooltip', { threshold: availability.thresholdHours })}
    >
      <span
        aria-hidden="true"
        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      {isOk
        ? t('availability.badge.active', { hours: formatHours(availability.hours) })
        : t(`availability.badge.${availability.status}`, {
            hours: formatHours(availability.hours),
            threshold: availability.thresholdHours,
          })}
    </span>
  );
}

/** Leyenda de los cuatro estados (panel admin). */
export function AvailabilityLegend({ thresholdHours, windowDays }) {
  const { t } = useI18n();

  return (
    <div className="flex items-center gap-4 flex-wrap text-[11px] text-gray-500 mb-3">
      <span className="font-medium text-gray-600">
        {t('availability.legendTitle', { days: windowDays ?? 7 })}
      </span>
      {['ok', 'low', 'none', 'not_configured'].map((status) => (
        <span key={status} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: colorsFor(status).color }}
          />
          {t(`availability.legend.${status}`, { threshold: thresholdHours ?? 10 })}
        </span>
      ))}
    </div>
  );
}
