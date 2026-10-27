/**
 * `state` firmado para el flujo OAuth de Google Calendar.
 *
 * Google devuelve el callback por GET, sin JWT de Calico, así que el servidor
 * necesita saber a qué usuario pertenece el código de autorización sin fiarse
 * de nada que viaje en la URL. El `state` es un JWT corto firmado con
 * `JWT_SECRET` que lleva el `sub` y un nonce; el nonce se guarda además en una
 * cookie HttpOnly y debe coincidir (protección CSRF / inyección de código).
 */

import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

const PURPOSE = 'calendar_oauth';
const TTL = '10m';

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET environment variable is not set');
  return value;
}

/**
 * @param {string} userId
 * @returns {{ state: string, nonce: string }}
 */
export function createOAuthState(userId) {
  const nonce = randomUUID();
  const state = jwt.sign({ sub: userId, nonce, purpose: PURPOSE }, secret(), { expiresIn: TTL });
  return { state, nonce };
}

/**
 * @param {string|null|undefined} state - valor que Google devolvió en la URL
 * @param {string|null|undefined} expectedNonce - nonce leído de la cookie
 * @returns {string|null} userId si todo cuadra; null en cualquier otro caso
 */
export function verifyOAuthState(state, expectedNonce) {
  if (!state || !expectedNonce) return null;
  try {
    const payload = jwt.verify(state, secret());
    if (payload?.purpose !== PURPOSE || payload.nonce !== expectedNonce || !payload.sub) {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}
