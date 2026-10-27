/**
 * Traduce `CalendarAuthError` a respuestas HTTP uniformes para las rutas que
 * dependen de la conexión con Google Calendar del tutor.
 *
 *   CALENDAR_NOT_CONNECTED         → 400 (el tutor nunca conectó o desconectó)
 *   CALENDAR_REAUTH_REQUIRED       → 401 (Google rechazó el refresh token)
 *   CALENDAR_ENCRYPTION_UNAVAILABLE → 503 (falta CALENDAR_TOKEN_ENCRYPTION_KEY)
 */

import { NextResponse } from 'next/server';
import { CalendarAuthError, CALENDAR_AUTH_CODES } from '@/lib/services/calendar-credential.service';

const STATUS_BY_CODE = {
  [CALENDAR_AUTH_CODES.NOT_CONNECTED]: 400,
  [CALENDAR_AUTH_CODES.REAUTH_REQUIRED]: 401,
  [CALENDAR_AUTH_CODES.ENCRYPTION_UNAVAILABLE]: 503,
};

/**
 * @param {unknown} error
 * @returns {NextResponse|null} respuesta lista para devolver, o null si no es un error de autorización de calendario
 */
export function calendarAuthErrorResponse(error) {
  if (!(error instanceof CalendarAuthError)) return null;
  return NextResponse.json(
    { success: false, error: error.message, code: error.code },
    { status: STATUS_BY_CODE[error.code] ?? 401 },
  );
}
