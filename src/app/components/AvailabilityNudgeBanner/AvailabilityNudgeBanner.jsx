'use client';

/**
 * Aviso persistente en la zona de tutor cuando la disponibilidad está vacía o
 * por debajo del mínimo. Sin bloques publicados el tutor no aparece en las
 * búsquedas y no recibe ninguna tutoría, y hoy no hay nada que se lo diga.
 *
 * Mismo patrón que CompleteProfileBanner: vive en el layout, se calla solo
 * cuando no aplica y no molesta en la propia página de disponibilidad.
 *
 * Dos tonos:
 *   - rojo   → 0 h configuradas (no recibirá tutorías)
 *   - ámbar  → tiene horas, pero por debajo del mínimo recomendado
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { AvailabilityService } from '../../services/core/AvailabilityService';
import { useAuth } from '../../context/SecureAuthContext';
import { useI18n } from '../../../lib/i18n';
import routes from '../../../routes';
import { formatHours } from '../AvailabilityStatus/AvailabilityStatus';

export default function AvailabilityNudgeBanner() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();
  const [availability, setAvailability] = useState(null);

  const isTutor = Boolean(user?.isLoggedIn && user?.isTutor);

  useEffect(() => {
    if (!isTutor) return;

    let cancelled = false;
    AvailabilityService.getMyAvailabilityStatus().then((status) => {
      if (!cancelled) setAvailability(status);
    });

    // La página de disponibilidad avisa al guardar; así el banner desaparece
    // sin esperar a una recarga completa.
    const refresh = () => {
      AvailabilityService.getMyAvailabilityStatus().then((status) => {
        if (!cancelled) setAvailability(status);
      });
    };
    window.addEventListener('availability-updated', refresh);

    return () => {
      cancelled = true;
      window.removeEventListener('availability-updated', refresh);
    };
  }, [isTutor]);

  if (loading || !isTutor) return null;
  if (pathname === routes.TUTOR_DISPONIBILIDAD) return null;
  if (!availability) return null;
  if (availability.status === 'ok') return null;

  const isEmpty = availability.status === 'not_configured' || availability.status === 'none';

  const tone = isEmpty
    ? 'bg-rose-50 border-rose-200 text-rose-800'
    : 'bg-amber-50 border-amber-200 text-amber-800';
  const ctaTone = isEmpty
    ? 'text-rose-700 hover:text-rose-900'
    : 'text-amber-700 hover:text-amber-900';

  const message = isEmpty
    ? t('availability.nudge.empty')
    : t('availability.nudge.low', {
        hours: formatHours(availability.hours),
        threshold: availability.thresholdHours,
      });

  return (
    <div className={`w-full border-b ${tone}`}>
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{message}</span>
        </div>
        <Link
          href={routes.TUTOR_DISPONIBILIDAD}
          className={`flex items-center gap-1 text-sm font-semibold flex-shrink-0 ${ctaTone}`}
        >
          {t('availability.nudge.cta')}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
