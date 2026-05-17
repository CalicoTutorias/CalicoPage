-- Durable copy of the booking "order ticket" created at Wompi intent time,
-- keyed by `reference`. Lets the server-to-server webhook rebuild the
-- session + attachments if the browser never reaches confirm-payment.
-- The session is still created ONLY after the payment is approved.
--
-- Additive and idempotent on purpose: it only creates a brand-new table and
-- never touches existing tables, so it cannot affect the live payment flow.

CREATE TABLE IF NOT EXISTS "payment_intents" (
  "id"          TEXT NOT NULL,
  "reference"   TEXT NOT NULL,
  "metadata"    JSONB NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_intents_reference_key"
  ON "payment_intents" ("reference");
