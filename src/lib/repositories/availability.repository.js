/**
 * Availability Repository
 * Handles database operations for availability blocks
 * (recurring weekly or one-time) and tutor schedule configuration.
 *
 * Models: Availability (dayOfWeek + time window, optional specificDate), Schedule (tutor preferences)
 */

import prisma from '../prisma';

// ===== AVAILABILITY =====

export async function findAvailabilityById(id) {
  return prisma.availability.findUnique({ where: { id } });
}

export async function findAvailabilityByUserId(userId, limit = 50) {
  return prisma.availability.findMany({
    where: { userId },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    take: limit,
  });
}

export async function findAvailabilityByDay(userId, dayOfWeek) {
  return prisma.availability.findMany({
    where: { userId, dayOfWeek },
    orderBy: { startTime: 'asc' },
  });
}

/**
 * Check if a new block overlaps with existing ones for the same user.
 * - Recurring blocks are compared against other recurring blocks for the same dayOfWeek.
 * - One-time blocks are compared against other one-time blocks for the same specificDate.
 * Returns the first conflicting block, or null if no overlap.
 *
 * @param {string} userId
 * @param {number} dayOfWeek
 * @param {Date} startTime
 * @param {Date} endTime
 * @param {string|null} excludeId - Block id to exclude from the check (for updates)
 * @param {{ recurring?: boolean, specificDate?: Date|null }} options
 */
export async function findOverlap(userId, dayOfWeek, startTime, endTime, excludeId = null, options = {}) {
  const { recurring = true, specificDate = null } = options;

  const where = {
    userId,
    recurring,
    ...(excludeId ? { id: { not: excludeId } } : {}),
  };

  if (recurring) {
    where.dayOfWeek = dayOfWeek;
  } else {
    where.specificDate = specificDate;
  }

  const blocks = await prisma.availability.findMany({ where });

  return blocks.find((b) => b.startTime < endTime && b.endTime > startTime) || null;
}

export async function createAvailability(data) {
  return prisma.availability.create({
    data: {
      userId:       data.userId,
      dayOfWeek:    data.dayOfWeek,
      startTime:    data.startTime,
      endTime:      data.endTime,
      recurring:    data.recurring ?? true,
      specificDate: data.specificDate ?? null,
    },
  });
}

export async function updateAvailability(id, data) {
  return prisma.availability.update({
    where: { id },
    data,
  });
}

export async function deleteAvailability(id) {
  await prisma.availability.delete({ where: { id } });
}

/**
 * Replace all recurring availability blocks for a user on a given day.
 * All created blocks are marked as recurring=true.
 * Deletes existing recurring blocks for that day, then creates the new ones atomically.
 */
export async function replaceAvailabilityForDay(userId, dayOfWeek, blocks) {
  const createOps = (blocks ?? []).map((b) =>
    prisma.availability.create({
      data: { userId, dayOfWeek, startTime: b.startTime, endTime: b.endTime, recurring: true, specificDate: null },
    })
  );

  const results = await prisma.$transaction([
    prisma.availability.deleteMany({ where: { userId, dayOfWeek, recurring: true } }),
    ...createOps,
  ]);

  return results.slice(1);
}

/**
 * Delete all availability blocks for a user.
 */
export async function deleteAllByUser(userId) {
  await prisma.availability.deleteMany({ where: { userId } });
}

/**
 * Replace ALL availability blocks for a user across all days atomically.
 * Used by calendar sync to fully mirror what the calendar contains.
 *
 * Each block may carry { recurring, specificDate } to distinguish
 * weekly recurring slots from one-time slots.
 *
 * @param {string} userId
 * @param {Array<{ dayOfWeek: number, startTime: Date, endTime: Date, recurring?: boolean, specificDate?: Date|null }>} blocks
 * @returns {Promise<Array>} Created availability records
 */
export async function replaceAllAvailability(userId, blocks) {
  const createOps = (blocks ?? []).map((b) =>
    prisma.availability.create({
      data: {
        userId,
        dayOfWeek:    b.dayOfWeek,
        startTime:    b.startTime,
        endTime:      b.endTime,
        recurring:    b.recurring ?? true,
        specificDate: b.specificDate ?? null,
      },
    })
  );

  const results = await prisma.$transaction([
    prisma.availability.deleteMany({ where: { userId } }),
    ...createOps,
  ]);

  return results.slice(1);
}

// ===== SCHEDULE (tutor configuration) =====

export async function findScheduleByUserId(userId) {
  return prisma.schedule.findUnique({ where: { userId } });
}

export async function upsertSchedule(userId, data) {
  return prisma.schedule.upsert({
    where: { userId },
    update: {
      timezone: data.timezone,
      autoAcceptSession: data.autoAcceptSession,
      minBookingNotice: data.minBookingNotice,
      maxSessionsPerDay: data.maxSessionsPerDay,
      bufferTime: data.bufferTime,
    },
    create: {
      userId,
      timezone: data.timezone ?? 'America/Bogota',
      autoAcceptSession: data.autoAcceptSession ?? false,
      minBookingNotice: data.minBookingNotice ?? 24,
      maxSessionsPerDay: data.maxSessionsPerDay ?? 5,
      bufferTime: data.bufferTime ?? 15,
    },
  });
}

export async function deleteSchedule(userId) {
  await prisma.schedule.delete({ where: { userId } }).catch((e) => {
    if (e.code !== 'P2025') throw e; // Ignore "not found"
  });
}
