-- Add a lightweight user classification for admin-created temporary users.
DO $$ BEGIN
  CREATE TYPE "UserKind" AS ENUM ('Registered', 'ExternalTemporary');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SessionSourceEnum" AS ENUM ('Platform', 'ManualAdmin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "kind" "UserKind" NOT NULL DEFAULT 'Registered',
  ADD COLUMN IF NOT EXISTS "phone_number_normalized" TEXT;

ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "source" "SessionSourceEnum" NOT NULL DEFAULT 'Platform',
  ADD COLUMN IF NOT EXISTS "manual_created_by_id" TEXT;

UPDATE "users"
SET "phone_number_normalized" = CASE
  WHEN "phone_number" IS NULL OR btrim("phone_number") = '' THEN NULL
  WHEN btrim("phone_number") LIKE '+%' THEN '+' || regexp_replace("phone_number", '\D', '', 'g')
  ELSE '+57' || regexp_replace("phone_number", '\D', '', 'g')
END
WHERE "phone_number" IS NOT NULL AND "phone_number_normalized" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_number_normalized_key"
  ON "users"("phone_number_normalized");

CREATE INDEX IF NOT EXISTS "sessions_source_idx"
  ON "sessions"("source");

DO $$ BEGIN
  ALTER TABLE "sessions"
    ADD CONSTRAINT "sessions_manual_created_by_id_fkey"
    FOREIGN KEY ("manual_created_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
