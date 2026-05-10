-- Migration: tutor_courses_status_and_course_prices
-- Adds granular approval status to tutor_courses, removes custom_price (pricing is now centralized),
-- and creates course_prices as the master pricing table managed by Calico.

-- 1. Create new enum type
CREATE TYPE "TutorCourseStatusEnum" AS ENUM ('Pending', 'Approved', 'Rejected');

-- 2. Add status column (nullable first so existing rows don't violate NOT NULL)
ALTER TABLE "tutor_courses" ADD COLUMN "status" "TutorCourseStatusEnum";

-- 3. Backfill: existing tutor_courses are already active → Approved
UPDATE "tutor_courses" SET "status" = 'Approved';

-- 4. Make status NOT NULL now that all rows have a value
ALTER TABLE "tutor_courses" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "tutor_courses" ALTER COLUMN "status" SET DEFAULT 'Pending';

-- 5. Drop custom_price (tutors no longer set prices; pricing is centralized)
ALTER TABLE "tutor_courses" DROP COLUMN IF EXISTS "custom_price";

-- 6. Create course_prices table
CREATE TABLE "course_prices" (
    "id"         TEXT          NOT NULL,
    "course_id"  TEXT          NOT NULL,
    "price"      DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT "course_prices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "course_prices_course_id_fkey"
        FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE,
    CONSTRAINT "course_prices_course_id_key" UNIQUE ("course_id")
);

-- 7. Seed course_prices from existing courses.base_price
INSERT INTO "course_prices" ("id", "course_id", "price", "created_at", "updated_at")
SELECT gen_random_uuid()::text, "id", "base_price", NOW(), NOW()
FROM "courses";
