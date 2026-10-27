/**
 * Hasta 2026-10 los tokens de Google Calendar vivían en dos cookies HttpOnly
 * del navegador del tutor. Ahora se persisten cifrados en la base; estas
 * cookies ya no se leen, pero conviene borrarlas en los navegadores que aún
 * las tengan. Eliminar este módulo cuando haya pasado su TTL máximo (30 días
 * desde el despliegue).
 */

const LEGACY_COOKIES = ['calendar_access_token', 'calendar_refresh_token'];

/**
 * @param {import('next/server').NextResponse} response
 */
export function clearLegacyCalendarCookies(response) {
  for (const name of LEGACY_COOKIES) {
    response.cookies.set(name, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 0,
      sameSite: 'lax',
      path: '/',
    });
  }
}
