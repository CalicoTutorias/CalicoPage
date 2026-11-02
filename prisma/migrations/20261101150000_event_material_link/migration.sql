-- A study material can also be an external link (the recording, a Drive folder…):
-- no file behind it, so the file columns become optional. Existing rows are files.
ALTER TABLE "event_materials"
  ADD COLUMN "url" TEXT,
  ALTER COLUMN "s3_key" DROP NOT NULL,
  ALTER COLUMN "mime_type" DROP NOT NULL,
  ALTER COLUMN "file_size" DROP NOT NULL;

ALTER TABLE "event_materials"
  ADD CONSTRAINT "event_materials_file_or_url_check" CHECK (("s3_key" IS NULL) <> ("url" IS NULL));

CREATE UNIQUE INDEX "event_materials_event_id_url_key" ON "event_materials"("event_id", "url");
