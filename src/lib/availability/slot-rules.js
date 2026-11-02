/**
 * Slot business rule shared by availability (blocks) and sessions (booking):
 * a session may only start at one of these minute marks (tutor timezone).
 * Pure module: no Prisma, safe to import anywhere.
 */
export const ALLOWED_SLOT_MINUTES = new Set([0, 10, 20, 30, 40, 45, 50]);
