-- Add expiry column for email verification tokens.
-- Existing rows get NULL (no expiry), which verifyEmailToken() treats as
-- already-expired so old tokens are invalidated on first use attempt.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "verification_token_expiry" TIMESTAMP(3);
