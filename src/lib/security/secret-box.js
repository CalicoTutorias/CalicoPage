/**
 * Secret box — cifrado simétrico en reposo para credenciales de terceros.
 *
 * AES-256-GCM con IV aleatorio por mensaje y tag de autenticación: un valor
 * cifrado no se puede leer ni alterar sin la clave. Formato de salida
 * (base64url, separado por puntos) para que el campo sea una sola columna TEXT:
 *
 *   v1.<iv>.<authTag>.<ciphertext>
 *
 * La clave viene de `CALENDAR_TOKEN_ENCRYPTION_KEY`: 32 bytes en base64 o hex
 * (`openssl rand -base64 32`). El prefijo de versión deja rotar el algoritmo
 * sin romper los valores ya guardados.
 *
 * Server-only (`node:crypto`).
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const VERSION = 'v1';

function decodeKey(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const candidates = [
    () => Buffer.from(value, 'base64'),
    () => Buffer.from(value, 'hex'),
  ];
  for (const decode of candidates) {
    const buf = decode();
    if (buf.length === KEY_BYTES) return buf;
  }
  return null;
}

let cachedKey;

function getKey() {
  if (cachedKey !== undefined) return cachedKey;
  cachedKey = decodeKey(process.env.CALENDAR_TOKEN_ENCRYPTION_KEY);
  return cachedKey;
}

/** Solo para tests: olvida la clave cacheada tras cambiar la variable de entorno. */
export function _resetKeyCache() {
  cachedKey = undefined;
}

export function isSecretBoxConfigured() {
  return getKey() !== null;
}

function requireKey() {
  const key = getKey();
  if (!key) {
    const err = new Error(
      'CALENDAR_TOKEN_ENCRYPTION_KEY no está definida o no son 32 bytes (base64/hex).',
    );
    err.code = 'SECRET_BOX_NOT_CONFIGURED';
    throw err;
  }
  return key;
}

/**
 * @param {string} plaintext
 * @returns {string} `v1.<iv>.<tag>.<ciphertext>` en base64url
 */
export function seal(plaintext) {
  if (typeof plaintext !== 'string') {
    throw new TypeError('seal() espera un string');
  }
  const key = requireKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/**
 * @param {string} sealed - valor producido por `seal()`
 * @returns {string} plaintext
 * @throws {Error} code `SECRET_BOX_INVALID` si el formato o el tag no cuadran
 */
export function open(sealed) {
  const key = requireKey();
  const parts = String(sealed ?? '').split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    const err = new Error('Valor cifrado con formato desconocido.');
    err.code = 'SECRET_BOX_INVALID';
    throw err;
  }
  const [, ivB64, tagB64, dataB64] = parts;
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    const err = new Error('No se pudo descifrar el valor (clave distinta o dato alterado).');
    err.code = 'SECRET_BOX_INVALID';
    throw err;
  }
}
