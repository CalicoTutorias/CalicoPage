'use client';

import { useCallback, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { useI18n } from '../../../../lib/i18n';

/**
 * Small "?" affordance that, on hover/focus, explains a metric: what it
 * measures, how it's computed, and how to read it (with action thresholds).
 *
 * Content is read from i18n under `${baseKey}.{title,what,calc,read}`, with
 * the section labels under `admin.growth.info.labels.*`.
 *
 * The tooltip is rendered with `position: fixed` (coords from the trigger's
 * bounding rect) so it escapes the `overflow-x-auto` of the metric tables
 * without being clipped — a plain absolutely-positioned tooltip would be.
 */
export default function MetricInfo({ baseKey, className = '' }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  const show = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 270;
    const estHeight = 188;
    let left = r.left + r.width / 2 - width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    const placeAbove = r.bottom + estHeight + 8 > window.innerHeight && r.top > estHeight;
    setPos({
      left,
      width,
      top:    placeAbove ? undefined : r.bottom + 8,
      bottom: placeAbove ? window.innerHeight - r.top + 8 : undefined,
    });
  }, []);

  const hide = useCallback(() => setPos(null), []);

  return (
    <span className={`relative inline-flex align-middle ${className}`}>
      <button
        ref={ref}
        type="button"
        aria-label={t(`${baseKey}.title`)}
        className="text-gray-300 hover:text-orange-500 focus-visible:text-orange-500 focus:outline-none transition"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {pos && (
        <div
          role="tooltip"
          style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, zIndex: 70 }}
          className="bg-gray-900 text-white text-[11px] leading-relaxed rounded-xl p-3 shadow-xl pointer-events-none normal-case font-normal tracking-normal text-left"
        >
          <p className="font-semibold text-sm mb-1.5">{t(`${baseKey}.title`)}</p>
          <p className="mb-1.5">
            <span className="text-orange-300 font-medium">{t('admin.growth.info.labels.what')}: </span>
            <span className="text-gray-200">{t(`${baseKey}.what`)}</span>
          </p>
          <p className="mb-1.5">
            <span className="text-orange-300 font-medium">{t('admin.growth.info.labels.calc')}: </span>
            <span className="text-gray-200">{t(`${baseKey}.calc`)}</span>
          </p>
          <p>
            <span className="text-orange-300 font-medium">{t('admin.growth.info.labels.read')}: </span>
            <span className="text-gray-200">{t(`${baseKey}.read`)}</span>
          </p>
        </div>
      )}
    </span>
  );
}
