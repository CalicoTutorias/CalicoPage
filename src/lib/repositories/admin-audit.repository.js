/**
 * Admin Audit Log Repository
 * Append-only access to admin_audit_log. Never expose UPDATE/DELETE.
 */

import prisma from '../prisma';

export async function create(data) {
  return prisma.adminAuditLog.create({ data });
}

/**
 * Paginated query of audit entries with optional filters.
 *
 * @param {Object} opts
 * @param {string} [opts.adminId]
 * @param {string} [opts.action]
 * @param {string} [opts.targetType]
 * @param {string} [opts.targetId]
 * @param {Date}   [opts.from]   created_at >= from
 * @param {Date}   [opts.to]     created_at <= to
 * @param {number} [opts.limit=50]
 * @param {number} [opts.offset=0]
 */
export async function findMany({
  adminId,
  action,
  targetType,
  targetId,
  from,
  to,
  limit = 50,
  offset = 0,
} = {}) {
  const where = {
    ...(adminId    && { adminId }),
    ...(action     && { action }),
    ...(targetType && { targetType }),
    ...(targetId   && { targetId }),
    ...(from || to ? {
      createdAt: {
        ...(from && { gte: from }),
        ...(to   && { lte: to }),
      },
    } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      skip: offset,
      include: {
        admin: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.adminAuditLog.count({ where }),
  ]);

  return { items, total };
}
