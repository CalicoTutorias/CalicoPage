'use client';

/**
 * Aviso persistente en la zona de tutor cuando la disponibilidad está vacía o
 * por debajo del mínimo.
 *
 * Mismo patrón que CompleteProfileBanner: vive en el layout, se calla solo
 * cuando no aplica y no molesta en la propia página de disponibilidad.
 *
 * Tres tonos, de más a menos grave:
 *   - OCULTO (`isListed === false`) → tarjeta grande roja: el tutor NO aparece
 *     en las búsquedas de los estudiantes hasta que publique horario. Es el
 *     aviso que no puede pasar desapercibido.
 *   - rojo (0 h esta semana, pero sí listado) → franja fina
 *   - ámbar (tiene horas, pero por debajo del mínimo) → franja fina
 *
 * `isListed` lo calcula el servidor con la misma regla que filtra los
 * listados (`lib/availability/listing-visibility.js`), así que este aviso y
 * lo que ven los estudiantes nunca se contradicen.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertCircle, ArrowRight, EyeOff } from 'lucide-react';
import { AvailabilityService } from '../../services/core/AvailabilityService';
import { useAuth } from '../../context/SecureAuthContext';
import { useI18n } from '../../../lib/i18n';
import routes from '../../../routes';
import { formatHours } from '../AvailabilityStatus/AvailabilityStatus';
import { isHiddenFromStudents } from '../../../lib/availability/listing-visibility';

/**
 * Tarjeta grande "tu perfil no aparece para los estudiantes". Se exporta para
 * reutilizarla en el perfil (`/home/profile`) con el mismo texto y tono.
 */
export function HiddenProfileAlert({ availability, className = '' }) {
  const { t } = useI18n();

  // Dos motivos posibles: no ha publicado nada, o publicó pero le quedan
  // menos horas libres que el mínimo para aparecer.
  const body = availability?.hasAnyBlocks
    ? t('availability.nudge.hiddenBodyLow', {
        hours: formatHours(availability.hours),
        min: availability.minListingHours,
        days: availability.windowDays,
      })
    : t('availability.nudge.hiddenBodyEmpty', {
        min: availability?.minListingHours ?? 3,
        days: availability?.windowDays ?? 7,
      });

  return (
    <div
      role="alert"
      className={`rounded-2xl border-2 border-rose-300 bg-rose-50 px-5 py-4 sm:px-6 sm:py-5 ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="flex-shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-rose-100 text-rose-700">
            <EyeOff className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="text-base sm:text-lg font-bold text-rose-900 leading-snug">
              {t('availability.nudge.hiddenTitle')}
            </p>
            <p className="text-sm text-rose-800 mt-1 leading-relaxed">
              {body}
            </p>
            <p className="text-xs text-rose-700/80 mt-1.5">
              {t('availability.nudge.hiddenHint')}
            </p>
          </div>
        </div>
        <Link
          href={routes.TUTOR_DISPONIBILIDAD}
          className="inline-flex items-center justify-center gap-1.5 flex-shrink-0 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold px-4 py-2.5 transition"
        >
          {t('availability.nudge.hiddenCta')}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

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
  if (availability.status === 'ok' && !isHiddenFromStudents(availability)) return null;

  // Sin horario publicado el tutor no existe para los estudiantes: tarjeta
  // grande, no una franja que se pueda ignorar.
  if (isHiddenFromStudents(availability)) {
    return (
      <div className="w-full bg-rose-100/60 border-b border-rose-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <HiddenProfileAlert availability={availability} />
        </div>
      </div>
    );
  }

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
