-- Add Review.courseId (denormalized from session.courseId).
-- Strategy: add as nullable, backfill from sessions, set NOT NULL,
-- attach FK + index. This avoids violating NOT NULL on existing rows.

-- 1. Add the column nullable so existing rows don't violate constraints.
ALTER TABLE "reviews" ADD COLUMN "course_id" TEXT;

-- 2. Backfill from the parent session. Every review must have a valid
--    session, so this should populate all rows.
UPDATE "reviews"
SET "course_id" = "sessions"."course_id"
FROM "sessions"
WHERE "reviews"."session_id" = "sessions"."id";

-- 3. Promote to NOT NULL now that every row has a value. If this fails,
--    a review is referencing a missing session — investigate before retrying.
ALTER TABLE "reviews" ALTER COLUMN "course_id" SET NOT NULL;

-- 4. FK constraint with RESTRICT: prevents accidentally deleting a course
--    that still has reviews attached (we want to preserve historical reviews).
ALTER TABLE "reviews"
    ADD CONSTRAINT "reviews_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "courses"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Composite index for the hot query: "rating of tutor X in course Y"
--    (per-subject rating breakdown on the tutor detail page) and the
--    paginated reviews-by-course list.
--
-- Historical note: this migration can run against two review-table shapes:
-- older shadow databases still have reviewer_id/reviewee_id/score here, while
-- reconciled live databases later use tutor_id/student_id/rating/status. Make
-- the index creation defensive so the migration history remains replayable.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reviews'
      AND column_name = 'tutor_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reviews'
      AND column_name = 'status'
  ) THEN
    CREATE INDEX IF NOT EXISTS "reviews_tutor_id_course_id_status_idx"
      ON "reviews"("tutor_id", "course_id", "status");
  END IF;
END $$;
