/**
 * Server-side authoritative session pricing.
 *
 * The pure math lives in `session-amount.js` (client-safe). This module adds
 * the DB lookup so the API can resolve a booking's charge from its course +
 * timestamps, never trusting any client-supplied amount (a tampered request
 * could otherwise pay any amount). The pure helpers are re-exported so existing
 * `@/lib/payments/pricing` imports keep working.
 */

import { findCourseById } from '../repositories/academic.repository';
import {
  PricingError,
  pricePerHour,
  sessionDurationHours,
  computeSessionAmount,
} from './session-amount';

export { PricingError, pricePerHour, sessionDurationHours, computeSessionAmount };

/**
 * Resolve the server-authoritative amount for a booking. Loads the course
 * (with its centralized price) and computes the charge from the session
 * length. Never consults any client-supplied amount.
 *
 * @param {{ courseId: string, startTimestamp: Date|string, endTimestamp: Date|string }} args
 * @returns {Promise<{ amount: number, pricePerHour: number, hours: number }>}
 * @throws {PricingError} MISSING_COURSE | COURSE_NOT_FOUND | NO_PRICE | BAD_INTERVAL
 */
export async function resolveSessionAmount({ courseId, startTimestamp, endTimestamp }) {
  if (!courseId) throw new PricingError('Missing courseId', 'MISSING_COURSE');

  const course = await findCourseById(courseId);
  if (!course) throw new PricingError('Course not found', 'COURSE_NOT_FOUND');

  const perHour = pricePerHour(course);
  const hours = sessionDurationHours(startTimestamp, endTimestamp);
  return {
    amount: Math.round(perHour * hours),
    pricePerHour: perHour,
    hours,
  };
}
