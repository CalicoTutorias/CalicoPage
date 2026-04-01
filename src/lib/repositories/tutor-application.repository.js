/**
 * TutorApplication Repository
 * Handles all database operations for tutor application data.
 */

import prisma from '../prisma';

/**
 * Create a new tutor application.
 * @param {Object} data - { userId, reasonsToTeach, subjects, contactInfo, status? }
 * @returns {Promise<Object>}
 */
export async function create(data) {
  return prisma.tutorApplication.create({ data });
}

/**
 * Find the most recent application for a user.
 * @param {number} userId
 * @returns {Promise<Object|null>}
 */
export async function findLatestByUserId(userId) {
  return prisma.tutorApplication.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Find an active (Pending) application for a user.
 * @param {number} userId
 * @returns {Promise<Object|null>}
 */
export async function findPendingByUserId(userId) {
  return prisma.tutorApplication.findFirst({
    where: { userId, status: 'Pending' },
  });
}

/**
 * Update the status of an application.
 * @param {string} id - Application UUID
 * @param {'Pending'|'Approved'|'Rejected'} status
 * @returns {Promise<Object>}
 */
export async function updateStatus(id, status) {
  return prisma.tutorApplication.update({
    where: { id },
    data: { status },
  });
}
