-- Study material of a tutoring session: uploaded by the tutor or an admin for the
-- student, who can only download it after leaving a review with a comment. Files
-- live in a private S3 prefix (session-materials/). Additive only.
CREATE TABLE "session_materials" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_materials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "session_materials_session_id_s3_key_key" ON "session_materials"("session_id", "s3_key");
CREATE INDEX "session_materials_session_id_created_at_idx" ON "session_materials"("session_id", "created_at");

ALTER TABLE "session_materials"
  ADD CONSTRAINT "session_materials_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
