/**
 * Rules of a finance proof (comprobante): transfers to tutors, refunds,
 * expenses, opening balances. Shared by the admin forms and the server
 * (no S3, no Prisma here).
 *
 * S3 (private bucket; only seen through a short-lived signed URL):
 *
 *   finance-proofs/{yyyy-mm}/{24 hex}.{ext}
 *
 * The server generates the key; registering a key that does not follow this
 * shape, or whose object was never uploaded, is refused.
 */

export const FINANCE_PROOF_TYPES = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
});

export const FINANCE_PROOF_ACCEPT = Object.keys(FINANCE_PROOF_TYPES).join(',');

export const MAX_FINANCE_PROOF_SIZE = 10 * 1024 * 1024; // 10 MB

export const FINANCE_PROOF_PREFIX = 'finance-proofs/';

const KEY_RE = /^finance-proofs\/\d{4}-\d{2}\/[a-f0-9]{24}\.(png|jpg|webp|pdf)$/;

/** Is this a key the server could have generated? */
export function isFinanceProofKey(key) {
  return KEY_RE.test(String(key ?? ''));
}

/** Folder of the month the proof is uploaded in (UTC). */
export function financeProofFolder(now = new Date()) {
  const ym = now.toISOString().slice(0, 7);
  return `${FINANCE_PROOF_PREFIX}${ym}/`;
}
