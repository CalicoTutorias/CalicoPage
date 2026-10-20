/**
 * Google Calendar Credential Repository
 *
 * Acceso a `google_calendar_credentials`: los tokens OAuth del tutor, cifrados
 * en reposo. Este repositorio devuelve las columnas cifradas tal cual; el único
 * consumidor legítimo es `calendar-credential.service`, que las descifra con
 * `secret-box`. Hacia rutas o UI solo debe salir `toSummary()`.
 */

import prisma from '../prisma';

/**
 * @param {string} userId
 * @returns {Promise<object|null>} fila completa (campos cifrados incluidos) o null
 */
export async function findByUserId(userId) {
  return prisma.googleCalendarCredential.findUnique({ where: { userId } });
}

/**
 * Crea o reemplaza la credencial del usuario. Una conexión nueva limpia
 * cualquier revocación previa.
 *
 * @param {string} userId
 * @param {{ refreshTokenEncrypted: string, accessTokenEncrypted?: string|null,
 *           accessTokenExpiresAt?: Date|null, scope?: string|null }} data
 */
export async function upsert(userId, data) {
  const fields = {
    refreshTokenEncrypted: data.refreshTokenEncrypted,
    accessTokenEncrypted: data.accessTokenEncrypted ?? null,
    accessTokenExpiresAt: data.accessTokenExpiresAt ?? null,
    scope: data.scope ?? null,
    revokedAt: null,
    revokedReason: null,
  };
  return prisma.googleCalendarCredential.upsert({
    where: { userId },
    create: { userId, ...fields },
    update: fields,
  });
}

/**
 * Guarda un access token renovado (y el refresh token si Google lo rotó).
 *
 * @param {string} userId
 * @param {{ accessTokenEncrypted: string, accessTokenExpiresAt: Date|null,
 *           refreshTokenEncrypted?: string }} data
 */
export async function updateTokens(userId, data) {
  return prisma.googleCalendarCredential.update({
    where: { userId },
    data: {
      accessTokenEncrypted: data.accessTokenEncrypted,
      accessTokenExpiresAt: data.accessTokenExpiresAt,
      ...(data.refreshTokenEncrypted
        ? { refreshTokenEncrypted: data.refreshTokenEncrypted }
        : {}),
    },
  });
}

/**
 * Marca la credencial como revocada por Google (p. ej. `invalid_grant`). El
 * access token se descarta; el refresh token cifrado se conserva solo como
 * evidencia hasta la próxima conexión.
 *
 * @param {string} userId
 * @param {string} reason
 */
export async function markRevoked(userId, reason) {
  return prisma.googleCalendarCredential.update({
    where: { userId },
    data: {
      revokedAt: new Date(),
      revokedReason: reason,
      accessTokenEncrypted: null,
      accessTokenExpiresAt: null,
    },
  });
}

/**
 * @param {string} userId
 * @returns {Promise<boolean>} true si existía una fila
 */
export async function deleteByUserId(userId) {
  const { count } = await prisma.googleCalendarCredential.deleteMany({ where: { userId } });
  return count > 0;
}

/**
 * Proyección segura para rutas y UI: nunca incluye material cifrado.
 *
 * @param {object|null} row
 * @returns {{ connectedAt: Date, revokedAt: Date|null, revokedReason: string|null, scope: string|null }|null}
 */
export function toSummary(row) {
  if (!row) return null;
  return {
    connectedAt: row.createdAt,
    revokedAt: row.revokedAt ?? null,
    revokedReason: row.revokedReason ?? null,
    scope: row.scope ?? null,
  };
}
