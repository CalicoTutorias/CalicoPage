import { z } from 'zod';

/**
 * Course list price in COP. Shared by course creation/update and by
 * course-suggestion approval so no admin path can persist a course that
 * checkout would later reject with NO_PRICE (see lib/payments/session-amount.js).
 * Accepts a numeric string ("40000") because form inputs arrive as text.
 */
export const basePriceSchema = z.preprocess(
  (value) => (typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value),
  z.number().int().finite().positive().max(1_000_000),
);

export const courseCodeSchema = z.string().trim().min(2).max(20).regex(/^\S+$/, 'INVALID_CODE');
