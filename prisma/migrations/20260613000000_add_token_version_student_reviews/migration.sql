-- Add columns introduced in schema but never migrated to the live database.
-- Applied via apply-pending.mjs (pg pool with rejectUnauthorized:false) because
-- the Prisma CLI (rustls) rejects the AWS RDS self-signed certificate chain.

-- ── Users: new columns ────────────────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "otp_attempts"         INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "token_version"        INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "student_rating"       DECIMAL(3,2) NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "student_rating_count" INTEGER     NOT NULL DEFAULT 0;

-- ── StudentReview table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "student_reviews" (
    "id"         TEXT        NOT NULL,
    "session_id" TEXT        NOT NULL,
    "tutor_id"   TEXT        NOT NULL,
    "student_id" TEXT        NOT NULL,
    "rating"     INTEGER,
    "status"     "ReviewStatusEnum" NOT NULL DEFAULT 'pending',
    "comment"    TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_reviews_pkey" PRIMARY KEY ("id")
);

-- ── Unique constraint ─────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "student_reviews_session_id_tutor_id_student_id_key"
    ON "student_reviews"("session_id", "tutor_id", "student_id");

-- ── Index ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "student_reviews_student_id_status_idx"
    ON "student_reviews"("student_id", "status");

-- ── Foreign keys (idempotent via DO $$ blocks) ───────────────────────────
DO $$ BEGIN
    ALTER TABLE "student_reviews"
        ADD CONSTRAINT "student_reviews_session_id_fkey"
        FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "student_reviews"
        ADD CONSTRAINT "student_reviews_tutor_id_fkey"
        FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "student_reviews"
        ADD CONSTRAINT "student_reviews_student_id_fkey"
        FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
