/** Business codes the API answers with: each one has its own translated message. */
const KNOWN_ERRORS = new Set([
  'INVALID_STUDENT_PHONE',
  'TUTOR_NOT_APPROVED',
  'COURSE_NOT_OFFERED',
  'COURSE_NOT_FOUND',
  'NO_PRICE',
  'SELF_BOOKING',
  'SLOT_NOT_AVAILABLE',
  'SESSION_CONFLICT',
  'STUDENT_CONTACT_CONFLICT',
  'PAYMENT_NOT_FOUND',
  'PAYMENT_IS_NOT_MANUAL',
  'PAYMENT_ALREADY_PAID',
  'SESSION_NOT_PAYABLE',
  'PROOF_INVALID_TYPE',
  'PROOF_TOO_LARGE',
  'PROOF_KEY_INVALID',
  'PROOF_NOT_UPLOADED',
  'PROOF_NOT_FOUND',
  'UPLOAD_FAILED',
]);

/**
 * i18n key for a failed AdminService call: requireAdminUser rate-limits each
 * admin (30 req/min) with a 429, known codes have their own message and
 * anything else gets `fallbackKey`.
 */
export function errorKey(res, fallbackKey) {
  if (res?.status === 429) return 'admin.manualSessions.errors.RATE_LIMITED';
  return KNOWN_ERRORS.has(res?.error) ? `admin.manualSessions.errors.${res.error}` : fallbackKey;
}
