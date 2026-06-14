-- Add a lightweight user classification for admin-created temporary users.
CREATE TYPE "UserKind" AS ENUM ('Registered', 'ExternalTemporary');
CREATE TYPE "SessionSourceEnum" AS ENUM ('Platform', 'ManualAdmin');

ALTER TABLE "users"
  ADD COLUMN "kind" "UserKind" NOT NULL DEFAULT 'Registered',
  ADD COLUMN "phone_number_normalized" TEXT;

ALTER TABLE "sessions"
  ADD COLUMN "source" "SessionSourceEnum" NOT NULL DEFAULT 'Platform',
  ADD COLUMN "manual_created_by_id" TEXT;

UPDATE "users"
SET "phone_number_normalized" = CASE
  WHEN "phone_number" IS NULL OR btrim("phone_number") = '' THEN NULL
  WHEN btrim("phone_number") LIKE '+%' THEN '+' || regexp_replace("phone_number", '\D', '', 'g')
  ELSE '+57' || regexp_replace("phone_number", '\D', '', 'g')
END
WHERE "phone_number" IS NOT NULL;

CREATE UNIQUE INDEX "users_phone_number_normalized_key"
  ON "users"("phone_number_normalized");

CREATE INDEX "sessions_source_idx"
  ON "sessions"("source");

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_manual_created_by_id_fkey"
  FOREIGN KEY ("manual_created_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
