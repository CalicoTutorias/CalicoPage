-- Manual sessions are paid outside the platform once the session is over: the
-- screenshot of that payment is what moves the row to `paid`. Existing rows
-- (Wompi charges and earlier manual sessions) simply have no proof.
ALTER TABLE "payments"
  ADD COLUMN "proof_s3_key" TEXT,
  ADD COLUMN "proof_uploaded_at" TIMESTAMP(3);
