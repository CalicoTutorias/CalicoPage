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
 * Persist the intent metadata. Idempotent on `reference`. Accepts a
 * transaction client so event checkouts can create it atomically with the
 * registration hold.
 */
export async function create({ reference, metadata, kind = 'session' }, client = prisma) {
  return client.paymentIntent.upsert({
    where: { reference },
    update: { metadata, kind },
    create: { reference, metadata, kind },
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
