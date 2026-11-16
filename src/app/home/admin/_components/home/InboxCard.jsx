'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { CARD, CHIP, INK, MUTED, TONE } from '../../eventos/_components/ui';

/**
 * Tarjeta de una cola de «Requiere acción». La franja izquierda y el chip
 * dicen la prioridad; con la cola vacía la tarjeta queda atenuada con «Al
 * día» (no desaparece: así se sabe que se revisó y no que falló la carga).
 */
const SEVERITY = {
  critical: { bar: 'border-l-[var(--calico-danger)]', chip: TONE.danger },
  high:     { bar: 'border-l-[var(--calico-orange)]', chip: TONE.warning },
  medium:   { bar: 'border-l-[var(--calico-slate-400)]', chip: TONE.info },
  ok:       { bar: 'border-l-[var(--calico-slate-200)]', chip: TONE.success },
};

export default function InboxCard({
  icon: Icon, title, href, cta, severity = 'ok', severityLabel, count, headline, details = [], overdueLabel, children,
  okLabel, errorLabel, failed = false,
}) {
  const tone = SEVERITY[severity] ?? SEVERITY.ok;
  const empty = !failed && severity === 'ok';

  return (
    <article className={`${CARD} border-l-4 ${tone.bar} p-4 flex flex-col gap-3 ${empty ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${MUTED}`} aria-hidden="true" />
          <h3 className={`text-sm font-semibold leading-snug ${INK}`}>{title}</h3>
        </div>
        {!failed && !empty && <span className={`${CHIP} ${tone.chip}`}>{severityLabel}</span>}
      </div>

      {failed ? (
        <p className="text-xs text-[var(--calico-danger-strong)]">{errorLabel}</p>
      ) : empty ? (
        <p className={`flex items-center gap-1.5 text-sm ${MUTED}`}>
          <CheckCircle2 className="w-4 h-4 text-[var(--calico-green-success)]" aria-hidden="true" />
          {okLabel}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className={`text-2xl font-bold leading-none ${INK}`}>{count}</p>
          {headline && <p className={`text-sm ${INK}`}>{headline}</p>}
          {details.filter(Boolean).map((line) => (
            <p key={line} className={`text-xs ${MUTED}`}>{line}</p>
          ))}
          {overdueLabel && <span className={`${CHIP} ${TONE.danger} self-start mt-1`}>{overdueLabel}</span>}
          {children}
        </div>
      )}

      {!failed && (
        <Link
          href={href}
          className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-[var(--calico-orange-text)] hover:text-[var(--calico-orange-text-hover)]"
        >
          {cta}
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      )}
    </article>
  );
}
