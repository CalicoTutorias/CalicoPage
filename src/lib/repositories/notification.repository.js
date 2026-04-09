/**
 * Notification Repository
 * Handles database operations for in-app notifications (PostgreSQL via Prisma).
 */

import prisma from '../prisma';

/**
 * Create a new notification.
 * @param {{ userId: number, type: string, message: string, sessionId?: string, metadata?: object }} data
 */
export async function create(data) {
  return prisma.notification.create({
    data: {
      userId: data.userId,
      type: data.type,
      message: data.message,
      sessionId: data.sessionId || null,
      metadata: data.metadata || null,
    },
  });
}

/**
 * Find notifications for a user, ordered by newest first.
 * @param {number} userId
 * @param {{ limit?: number, unreadOnly?: boolean }} options
 */
export async function findByUserId(userId, { limit = 50, unreadOnly = false } = {}) {
  const where = { userId };
  if (unreadOnly) where.isRead = false;

  return prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Find a single notification by ID.
 */
export async function findById(id) {
  return prisma.notification.findUnique({ where: { id } });
}

/**
 * Mark a single notification as read.
 */
export async function markAsRead(id) {
  return prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });
}

/**
 * Mark all notifications as read for a user.
 * Returns the count of updated rows.
 */
export async function markAllAsRead(userId) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}

/**
 * Delete a notification by ID.
 */
export async function deleteById(id) {
  return prisma.notification.delete({ where: { id } });
}

/**
 * Count unread notifications for a user.
 */
export async function countUnread(userId) {
  return prisma.notification.count({
    where: { userId, isRead: false },
  });
}
