/**
 * Admin Audit Service
 * Records every admin action for traceability.
 *
 * Design: append-only. No update/delete operations exposed. Failures here
 * are logged but never block the underlying admin action — losing a log
 * entry is bad, but blocking a legitimate approval is worse.
 */

import * as adminAuditRepository from '../repositories/admin-audit.repository';

/**
 * Standardised action names. Use these constants instead of string literals
 * so renames stay consistent and grep-able.
 */
export const ADMIN_ACTIONS = {
  TUTOR_APPROVE:        'TUTOR_APPROVE',
  TUTOR_REJECT:         'TUTOR_REJECT',
  TUTOR_SUSPEND:        'TUTOR_SUSPEND',
  TUTOR_REINSTATE:      'TUTOR_REINSTATE',
  COURSE_APPROVE:       'COURSE_APPROVE',
  COURSE_REJECT:        'COURSE_REJECT',
  PRICE_UPDATE:         'PRICE_UPDATE',
  TUTOR_PAYOUT_MARKED:  'TUTOR_PAYOUT_MARKED',
  TUTOR_PAYOUT_BULK:    'TUTOR_PAYOUT_BULK',
  MANUAL_SESSION_CREATE: 'MANUAL_SESSION_CREATE',
  MANUAL_SESSION_PAYMENT_CONFIRM: 'MANUAL_SESSION_PAYMENT_CONFIRM',
};

/**
 * Extract IP and user-agent from a Next.js Request, falling back through the
 * common reverse-proxy headers used by Vercel / Nginx / Cloudflare.
 */
function extractRequestMetadata(request) {
  if (!request) return { ipAddress: null, userAgent: null };
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    null;
  const userAgent = request.headers.get('user-agent') || null;
  return { ipAddress, userAgent };
}

/**
 * Persist an audit entry. Always returns; never throws to callers.
 *
 * @param {Object} entry
 * @param {string} entry.adminId
 * @param {string} entry.action       e.g. ADMIN_ACTIONS.TUTOR_APPROVE
 * @param {string} [entry.targetType] e.g. 'User' | 'TutorApplication' | 'Course'
 * @param {string} [entry.targetId]
 * @param {Object} [entry.payload]    JSON snapshot of what changed (before/after)
 * @param {Request} [entry.request]   Source request, used to derive IP/UA
 */
export async function logAction({ adminId, action, targetType, targetId, payload, request }) {
  if (!adminId || !action) {
    console.error('[admin-audit] Missing required fields:', { adminId, action });
    return null;
  }

  const { ipAddress, userAgent } = extractRequestMetadata(request);

  try {
    return await adminAuditRepository.create({
      adminId,
      action,
      targetType: targetType ?? null,
      targetId:   targetId   ?? null,
      payload:    payload    ?? null,
      ipAddress,
      userAgent,
    });
  } catch (err) {
    // Audit failures must NEVER block the admin action — log and swallow.
    console.error('[admin-audit] Failed to record action:', { action, targetId, err: err.message });
    return null;
  }
}

export async function listEntries(opts) {
  return adminAuditRepository.findMany(opts);
}
