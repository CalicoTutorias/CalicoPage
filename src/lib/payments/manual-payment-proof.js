/**
 * Reglas del comprobante de pago de una tutoría manual, compartidas por el
 * formulario de admin y el servidor (sin S3 ni Prisma).
 *
 * S3 (bucket AWS_S3_BUCKET, privado; solo se ve con URL firmada de vida corta):
 *
 *   manual-payment-proofs/{sessionId}/{12 hex}.{ext}
 *
 * El servidor genera la clave y la ata a la sesión, así que no se puede
 * registrar como comprobante un archivo de otra tutoría.
 */

/** Tipos admitidos → extensión del objeto. */
export const PROOF_TYPES = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
});

/** `accept` del selector de archivos. */
export const PROOF_ACCEPT = Object.keys(PROOF_TYPES).join(',');

export const MAX_PROOF_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const PROOF_PREFIX = 'manual-payment-proofs/';

export function proofFolder(sessionId) {
  return `${PROOF_PREFIX}${sessionId}/`;
}

/** ¿Esta clave es un comprobante de esta sesión? */
export function isProofKeyOfSession(key, sessionId) {
  const name = String(key ?? '');
  const folder = proofFolder(sessionId);
  if (!name.startsWith(folder)) return false;
  return /^[a-f0-9]{12}\.(png|jpg|webp)$/.test(name.slice(folder.length));
}
