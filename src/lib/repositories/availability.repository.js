/**
 * Availability Repository
 * Handles database operations for weekly recurring availability blocks
 * and tutor schedule configuration (PostgreSQL via Prisma).
 *
 * Models: Availability (dayOfWeek + time window), Schedule (tutor preferences)
 */

import prisma from '../prisma';

// ===== AVAILABILITY (recurring weekly blocks) =====

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
 * Check if a new block overlaps with existing ones for the same user + day.
 * Returns the first conflicting block, or null if no overlap.
 */
export async function findOverlap(userId, dayOfWeek, startTime, endTime, excludeId = null) {
  const blocks = await prisma.availability.findMany({
    where: {
      userId,
      dayOfWeek,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });

  return blocks.find((b) => {
    // Overlap: existingStart < newEnd AND existingEnd > newStart
    return b.startTime < endTime && b.endTime > startTime;
  }) || null;
}

export async function createAvailability(data) {
  return prisma.availability.create({
    data: {
      userId: data.userId,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
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
 * Replace all availability blocks for a user on a given day (bulk upsert pattern).
 * Deletes existing blocks for that day, then creates the new ones in a transaction.
 *
 * Uses the sequential $transaction([...ops]) API instead of the interactive
 * callback form to avoid Prisma P2028 (concurrent queries on a single tx connection).
 */
export async function replaceAvailabilityForDay(userId, dayOfWeek, blocks) {
  const createOps = (blocks ?? []).map((b) =>
    prisma.availability.create({
      data: { userId, dayOfWeek, startTime: b.startTime, endTime: b.endTime },
    })
  );

  // deleteMany runs first, then each create — all atomic.
  const results = await prisma.$transaction([
    prisma.availability.deleteMany({ where: { userId, dayOfWeek } }),
    ...createOps,
  ]);

  // results[0] is the deleteMany count; results[1..n] are the created records.
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
 * @param {number} userId
 * @param {Array<{ dayOfWeek: number, startTime: Date, endTime: Date }>} blocks
 * @returns {Promise<Array>} Created availability records
 */
export async function replaceAllAvailability(userId, blocks) {
  const createOps = (blocks ?? []).map((b) =>
    prisma.availability.create({
      data: { userId, dayOfWeek: b.dayOfWeek, startTime: b.startTime, endTime: b.endTime },
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
