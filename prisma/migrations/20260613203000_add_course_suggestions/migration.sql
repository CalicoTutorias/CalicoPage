DO $$ BEGIN
  CREATE TYPE "CourseSuggestionStatusEnum" AS ENUM ('Pending', 'Approved', 'Rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "course_suggestions" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "notes" TEXT,
  "status" "CourseSuggestionStatusEnum" NOT NULL DEFAULT 'Pending',
  "requester_id" TEXT,
  "reviewed_by_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "course_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "course_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "course_suggestions_status_created_at_idx"
  ON "course_suggestions"("status", "created_at");

CREATE INDEX IF NOT EXISTS "course_suggestions_code_idx"
  ON "course_suggestions"("code");

DO $$ BEGIN
  ALTER TABLE "course_suggestions"
    ADD CONSTRAINT "course_suggestions_requester_id_fkey"
    FOREIGN KEY ("requester_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "course_suggestions"
    ADD CONSTRAINT "course_suggestions_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "course_suggestions"
    ADD CONSTRAINT "course_suggestions_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "courses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
