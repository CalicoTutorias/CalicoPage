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

/**
 * Unconsumed intents where money was (or may have been) taken but nothing
 * was booked, newest first:
 *   - the payments sweeper saw an APPROVED transaction (`metadata.sweep.status`,
 *     whatever its outcome: NEEDS_ATTENTION, a transient ERROR…), or
 *   - confirm-payment pinned a `pendingTransactionId`, the intent is older
 *     than `pendingAfterMinutes` (the webhook had that long to settle it) and
 *     the sweeper has not seen that transaction end unpaid (DECLINED, VOIDED,
 *     ERROR).
 * An intent the sweeper found ALREADY_PROCESSED is booked (its payment row
 * exists) even if it was never marked consumed, so it is left out.
 * Each row carries the student, tutor, course and event names the intent
 * points at (LEFT JOIN: a deleted row leaves nulls). The full `metadata` is
 * returned for the service to pick from; it never reaches a response as is.
 */
export async function findUnbooked({ pendingAfterMinutes = 15, limit = 200 } = {}) {
  return prisma.$queryRaw`
    SELECT
      pi.reference,
      pi.kind::text   AS kind,
      pi.metadata,
      pi.created_at,
      st.name         AS student_name,
      st.email        AS student_email,
      tu.name         AS tutor_name,
      c.code          AS course_code,
      c.name          AS course_name,
      e.title         AS event_title,
      e.starts_at     AS event_starts_at
    FROM payment_intents pi
    LEFT JOIN users   st ON st.id = pi.metadata->>'studentId'
    LEFT JOIN users   tu ON tu.id = pi.metadata->>'tutorId'
    LEFT JOIN courses c  ON c.id  = pi.metadata->>'courseId'
    LEFT JOIN events  e  ON e.id  = pi.metadata->>'eventId'
    WHERE pi.consumed_at IS NULL
      AND COALESCE(pi.metadata->'sweep'->>'outcome', '') <> 'ALREADY_PROCESSED'
      AND (
        pi.metadata->'sweep'->>'status' = 'APPROVED'
        OR (
          COALESCE(pi.metadata->>'pendingTransactionId', '') <> ''
          AND COALESCE(pi.metadata->'sweep'->>'status', '') NOT IN ('DECLINED', 'VOIDED', 'ERROR')
          AND pi.created_at < (NOW() AT TIME ZONE 'UTC') - (${pendingAfterMinutes}::int * INTERVAL '1 minute')
        )
      )
    ORDER BY pi.created_at DESC
    LIMIT ${limit}::int
  `;
}

/**
 * Remember the Wompi transaction the student's browser reported for this
 * intent when the server could not verify it (Wompi down). The id is only a
 * pointer: whoever recovers the payment (webhook retry, admin reconcile)
 * re-fetches the transaction from Wompi before booking anything.
 *
 * Atomic JSONB merge so a concurrent webhook never clobbers the frozen
 * pricing snapshot. Never touches a consumed intent. Best-effort: never throws.
 */
export async function recordPendingTransaction(reference, transactionId) {
  if (!reference || !transactionId) return;
  const patch = JSON.stringify({
    pendingTransactionId: String(transactionId),
    pendingTransactionAt: new Date().toISOString(),
  });
  try {
    await prisma.$executeRaw`
      UPDATE payment_intents
      SET metadata = metadata || ${patch}::jsonb
      WHERE reference = ${reference} AND consumed_at IS NULL
    `;
  } catch (err) {
    console.warn(`[PaymentIntent] Failed to record pending transaction for ${reference}:`, err.message);
  }
}

/**
 * Unconsumed intents for the payment sweeper: created inside
 * [createdFrom, createdTo] and whose stored sweep result (`metadata.sweep`)
 * is neither one of `skipStatuses` (final Wompi statuses) nor one of
 * `skipOutcomes` (results a human now owns). Least recently swept first —
 * never swept, then the oldest check — and oldest intent first on ties, so a
 * backlog larger than `limit` rotates instead of re-checking the same rows
 * every run. `created_at` is a `timestamp` holding UTC wall time, so the
 * bounds are converted to UTC explicitly (never the session TimeZone).
 *
 * @returns {Promise<Array<{ reference: string, kind: string, metadata: object, createdAt: Date }>>}
 */
export async function findUnconsumedForSweep({ createdFrom, createdTo, skipStatuses = [], skipOutcomes = [], limit }) {
  return prisma.$queryRaw`
    SELECT reference, kind::text AS kind, metadata, created_at AS "createdAt"
    FROM payment_intents
    WHERE consumed_at IS NULL
      AND created_at >= (${createdFrom.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      AND created_at <= (${createdTo.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      AND COALESCE(metadata->'sweep'->>'status', '') <> ALL(${skipStatuses}::text[])
      AND COALESCE(metadata->'sweep'->>'outcome', '') <> ALL(${skipOutcomes}::text[])
    ORDER BY metadata->'sweep'->>'checkedAt' ASC NULLS FIRST, created_at ASC
    LIMIT ${limit}
  `;
}

/**
 * Store the payment sweeper's latest result as `metadata.sweep`, replacing
 * the previous one. Atomic JSONB merge like recordPendingTransaction, so the
 * pricing snapshot, `pendingTransactionId` and every other key are kept.
 * Unlike it, a consumed intent is written too: when the sweep itself booked
 * the payment, the fulfil path consumed the intent a moment earlier and the
 * record of how it was booked is still wanted. Best-effort: never throws.
 */
export async function recordSweepResult(reference, sweep) {
  if (!reference || !sweep) return;
  const patch = JSON.stringify({ sweep });
  try {
    await prisma.$executeRaw`
      UPDATE payment_intents
      SET metadata = metadata || ${patch}::jsonb
      WHERE reference = ${reference}
    `;
  } catch (err) {
    console.warn(`[PaymentIntent] Failed to record the sweep result for ${reference}:`, err.message);
  }
}
