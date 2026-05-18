/**
 * Payment Intent Repository
 * Durable copy of the booking metadata created at Wompi intent time,
 * keyed by the Wompi `reference`. Used as a fallback so the webhook can
 * rebuild the session + attachments if the client never reaches
 * /api/payments/confirm-payment.
 *
 * Model: PaymentIntent
 */

import prisma from '../prisma';

/**
 * Persist the intent metadata. Idempotent on `reference`: a retry with the
 * same reference updates the stored metadata instead of failing on the
 * unique constraint.
 */
export async function create({ reference, metadata }) {
  return prisma.paymentIntent.upsert({
    where: { reference },
    update: { metadata },
    create: { reference, metadata },
  });
}

/**
 * Look up a stored intent by its Wompi reference.
 * @returns {Promise<{ reference: string, metadata: object, consumedAt: Date|null }|null>}
 */
export async function findByReference(reference) {
  if (!reference) return null;
  return prisma.paymentIntent.findUnique({ where: { reference } });
}

/**
 * Mark an intent as consumed once its payment has been processed.
 * Best-effort: never throws (the payment already succeeded by this point).
 */
export async function markConsumed(reference) {
  if (!reference) return;
  try {
    await prisma.paymentIntent.update({
      where: { reference },
      data: { consumedAt: new Date() },
    });
  } catch (err) {
    console.warn(`[PaymentIntent] Failed to mark ${reference} consumed:`, err.message);
  }
}
