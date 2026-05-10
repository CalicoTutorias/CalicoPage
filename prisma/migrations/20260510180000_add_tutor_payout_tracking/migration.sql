-- Track whether each Payment has been paid out to the tutor (manual
-- transfer to their `llave`). Earnings are 20% of amount minus the Wompi
-- gateway fee; the tutor receives 80% of `amount` regardless.

CREATE TYPE "TutorPayoutStatusEnum" AS ENUM ('pending', 'paid');

ALTER TABLE "payments"
  ADD COLUMN "tutor_payout_status" "TutorPayoutStatusEnum" NOT NULL DEFAULT 'pending',
  ADD COLUMN "tutor_payout_at"     TIMESTAMP(3),
  ADD COLUMN "tutor_payout_note"   TEXT,
  ADD COLUMN "tutor_payout_by_id"  TEXT;

-- Hot-path: "list everything pending payout" filters on these two columns.
CREATE INDEX "payments_tutor_payout_status_status_idx"
  ON "payments" ("tutor_payout_status", "status");

-- Per-tutor lookup for the weekly digest grouped view.
CREATE INDEX "payments_tutor_id_tutor_payout_status_idx"
  ON "payments" ("tutor_id", "tutor_payout_status");
