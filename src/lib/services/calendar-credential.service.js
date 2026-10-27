/**
 * Calendar Credential Service
 *
 * Único punto de acceso a los tokens OAuth de Google Calendar de un tutor.
 * Las rutas nunca ven el refresh token: piden `getAccessToken(userId)` y
 * reciben un access token vigente, renovado y persistido en silencio si hacía
 * falta. Cualquier fallo de autorización sale como `CalendarAuthError` con un
 * código estable que la capa HTTP traduce (ver `src/lib/http/calendar-errors.js`).
 *
 * Server-only: toca Prisma, `secret-box` y la API de Google.
 */

import * as credentialRepo from '../repositories/google-calendar-credential.repository';
import * as calendarService from './calendar.service';
import { seal, open, isSecretBoxConfigured } from '../security/secret-box';

/** Margen para no entregar un access token a punto de caducar. */
const ACCESS_TOKEN_SKEW_MS = 60 * 1000;

/** Google no siempre informa `expiry_date`; por defecto el access token dura 1 h. */
const DEFAULT_ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;

export const CALENDAR_AUTH_CODES = Object.freeze({
  NOT_CONNECTED: 'CALENDAR_NOT_CONNECTED',
  REAUTH_REQUIRED: 'CALENDAR_REAUTH_REQUIRED',
  ENCRYPTION_UNAVAILABLE: 'CALENDAR_ENCRYPTION_UNAVAILABLE',
});

const MESSAGES = {
  [CALENDAR_AUTH_CODES.NOT_CONNECTED]: 'Conecta tu Google Calendar antes de continuar.',
  [CALENDAR_AUTH_CODES.REAUTH_REQUIRED]:
    'Google dejó de aceptar la conexión con tu calendario. Vuelve a conectarlo.',
  [CALENDAR_AUTH_CODES.ENCRYPTION_UNAVAILABLE]:
    'La integración con Google Calendar no está configurada en el servidor.',
};

export class CalendarAuthError extends Error {
  /**
   * @param {keyof typeof MESSAGES} code
   * @param {{ cause?: unknown }} [options]
   */
  constructor(code, options = {}) {
    super(MESSAGES[code] ?? code);
    this.name = 'CalendarAuthError';
    this.code = code;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

function requireEncryption() {
  if (!isSecretBoxConfigured()) {
    throw new CalendarAuthError(CALENDAR_AUTH_CODES.ENCRYPTION_UNAVAILABLE);
  }
}

function isAccessTokenFresh(row, now = Date.now()) {
  if (!row.accessTokenEncrypted || !row.accessTokenExpiresAt) return false;
  return new Date(row.accessTokenExpiresAt).getTime() - ACCESS_TOKEN_SKEW_MS > now;
}

function expiryFromGoogle(credentials, now = Date.now()) {
  const expiry = Number(credentials?.expiry_date);
  if (Number.isFinite(expiry) && expiry > now) return new Date(expiry);
  return new Date(now + DEFAULT_ACCESS_TOKEN_TTL_MS);
}

/**
 * Google responde `invalid_grant` cuando el refresh token fue revocado por el
 * usuario, caducó (app en modo "Testing") o la contraseña cambió. Reintentar
 * no sirve: hay que pasar otra vez por el consentimiento.
 */
function isInvalidGrant(error) {
  const status = error?.code ?? error?.response?.status;
  const text = `${error?.message ?? ''} ${error?.response?.data?.error ?? ''}`;
  return /invalid_grant/i.test(text) || (status === 400 && /grant/i.test(text));
}

/**
 * Persiste los tokens obtenidos en el callback OAuth.
 *
 * @param {string} userId
 * @param {{ refresh_token?: string, access_token?: string, expiry_date?: number, scope?: string }} tokens
 * @throws {CalendarAuthError} REAUTH_REQUIRED si Google no devolvió refresh token
 */
export async function saveFromOAuth(userId, tokens) {
  requireEncryption();
  if (!tokens?.refresh_token) {
    // Pedimos `prompt=consent` + `access_type=offline`, así que esto solo pasa
    // si Google omitió el refresh token; sin él la conexión moriría en 1 h.
    throw new CalendarAuthError(CALENDAR_AUTH_CODES.REAUTH_REQUIRED);
  }
  await credentialRepo.upsert(userId, {
    refreshTokenEncrypted: seal(tokens.refresh_token),
    accessTokenEncrypted: tokens.access_token ? seal(tokens.access_token) : null,
    accessTokenExpiresAt: tokens.access_token ? expiryFromGoogle(tokens) : null,
    scope: tokens.scope ?? null,
  });
}

/**
 * Devuelve un access token vigente para el usuario, renovándolo con el refresh
 * token (y guardándolo) cuando caducó.
 *
 * @param {string} userId
 * @returns {Promise<{ accessToken: string, refreshed: boolean }>}
 * @throws {CalendarAuthError}
 */
export async function getAccessToken(userId) {
  requireEncryption();
  const row = await credentialRepo.findByUserId(userId);
  if (!row) throw new CalendarAuthError(CALENDAR_AUTH_CODES.NOT_CONNECTED);
  if (row.revokedAt) throw new CalendarAuthError(CALENDAR_AUTH_CODES.REAUTH_REQUIRED);

  if (isAccessTokenFresh(row)) {
    return { accessToken: open(row.accessTokenEncrypted), refreshed: false };
  }

  let credentials;
  try {
    credentials = await calendarService.refreshAccessToken(open(row.refreshTokenEncrypted));
  } catch (error) {
    if (isInvalidGrant(error)) {
      await credentialRepo.markRevoked(userId, 'invalid_grant');
      throw new CalendarAuthError(CALENDAR_AUTH_CODES.REAUTH_REQUIRED, { cause: error });
    }
    throw error;
  }

  if (!credentials?.access_token) {
    throw new CalendarAuthError(CALENDAR_AUTH_CODES.REAUTH_REQUIRED);
  }

  await credentialRepo.updateTokens(userId, {
    accessTokenEncrypted: seal(credentials.access_token),
    accessTokenExpiresAt: expiryFromGoogle(credentials),
    ...(credentials.refresh_token
      ? { refreshTokenEncrypted: seal(credentials.refresh_token) }
      : {}),
  });

  return { accessToken: credentials.access_token, refreshed: true };
}

/**
 * Estado de la conexión para la UI. Solo habla con Google cuando el access
 * token guardado ya caducó (como mucho una vez por hora por tutor).
 *
 * @param {string} userId
 * @returns {Promise<{ connected: boolean, status: 'connected'|'not_connected'|'reauth_required'|'encryption_unavailable', refreshed: boolean, connectedAt: Date|null }>}
 */
export async function getConnectionStatus(userId) {
  const row = isSecretBoxConfigured() ? await credentialRepo.findByUserId(userId) : null;
  const connectedAt = credentialRepo.toSummary(row)?.connectedAt ?? null;
  try {
    const { refreshed } = await getAccessToken(userId);
    return { connected: true, status: 'connected', refreshed, connectedAt };
  } catch (error) {
    if (!(error instanceof CalendarAuthError)) throw error;
    const status = {
      [CALENDAR_AUTH_CODES.NOT_CONNECTED]: 'not_connected',
      [CALENDAR_AUTH_CODES.REAUTH_REQUIRED]: 'reauth_required',
      [CALENDAR_AUTH_CODES.ENCRYPTION_UNAVAILABLE]: 'encryption_unavailable',
    }[error.code];
    return { connected: false, status, refreshed: false, connectedAt };
  }
}

/**
 * Desconecta: revoca el refresh token en Google (best-effort) y borra la fila.
 *
 * @param {string} userId
 * @returns {Promise<boolean>} true si había credencial
 */
export async function revoke(userId) {
  const row = await credentialRepo.findByUserId(userId);
  if (!row) return false;

  if (!row.revokedAt && isSecretBoxConfigured()) {
    try {
      await calendarService.revokeToken(open(row.refreshTokenEncrypted));
    } catch (error) {
      // Si Google ya lo invalidó o la red falla, igual borramos lo nuestro: el
      // tutor no debe quedar "conectado" por un fallo ajeno.
      console.warn('[calendar-credential] revoke en Google falló', {
        code: error?.code ?? 'CALENDAR_REVOKE_FAILED',
      });
    }
  }

  return credentialRepo.deleteByUserId(userId);
}
