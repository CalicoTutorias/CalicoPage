-- Add courses.career_id (FK -> careers.id), backfilled from the existing
-- course code prefix (first 4 letters), then NOT NULL + indexed.
--
-- Course codes already encode their career (e.g. "ISIS2211" -> career
-- code "ISIS"), but there is no FK today. This migration is intentionally
-- written by hand (not `prisma migrate dev` diff output) because the
-- backfill needs prefix-matching logic plus an explicit exception and a
-- hard-fail report for anything that still doesn't resolve.

-- 1. Add the column nullable first, so existing rows aren't rejected.
-- TEXT (not a native UUID type) to match every other id/FK column in this
-- schema (careers.id, courses.id, users.career_id, etc. are all TEXT).
ALTER TABLE "courses" ADD COLUMN "career_id" TEXT;

-- 2. Backfill: match the course's 4-letter code prefix against careers.code.
UPDATE "courses" c
SET "career_id" = ca."id"
FROM "careers" ca
WHERE ca."code" = LEFT(c."code", 4)
  AND c."career_id" IS NULL;

-- 3. Known exception: "CALCINT" ("Cálculo Integral") uses a legacy,
-- non-official course code whose 4-letter prefix ("CALC") is not a
-- career code. Map it explicitly to "MATE" (Matemáticas) — the course is
-- calculus content, same subject area as the existing MATE12xx courses.
UPDATE "courses" c
SET "career_id" = ca."id"
FROM "careers" ca
WHERE c."code" = 'CALCINT'
  AND ca."code" = 'MATE'
  AND c."career_id" IS NULL;

-- 4. Fail loudly (and report) instead of leaving silent NULLs: if any
-- course still has no matching career, abort the migration before the
-- NOT NULL/FK steps below, listing every offending code.
DO $$
DECLARE
  unresolved TEXT;
BEGIN
  SELECT string_agg(code, ', ' ORDER BY code) INTO unresolved
  FROM "courses"
  WHERE "career_id" IS NULL;

  IF unresolved IS NOT NULL THEN
    RAISE EXCEPTION 'Courses with no matching career (add a career or an explicit mapping above): %', unresolved;
  END IF;
END $$;

-- 5. Enforce NOT NULL now that every row is resolved.
ALTER TABLE "courses" ALTER COLUMN "career_id" SET NOT NULL;

-- 6. Foreign key — RESTRICT, matching the existing Session->Course pattern,
-- so a career cannot be deleted while courses still reference it.
ALTER TABLE "courses"
  ADD CONSTRAINT "courses_career_id_fkey"
  FOREIGN KEY ("career_id") REFERENCES "careers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. Index for lookups/filtering by career.
CREATE INDEX "courses_career_id_idx" ON "courses"("career_id");

-- ─── ROLLBACK (run manually if this needs to be reverted after it has
-- already been applied successfully) ────────────────────────────────────
-- ALTER TABLE "courses" DROP CONSTRAINT "courses_career_id_fkey";
-- DROP INDEX "courses_career_id_idx";
-- ALTER TABLE "courses" DROP COLUMN "career_id";
