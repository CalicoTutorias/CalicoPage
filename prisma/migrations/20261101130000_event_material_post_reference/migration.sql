-- Study material can point at a file of Admin → Posts instead of a copy of it:
-- post_slug set means s3_key lives in the posts bucket and belongs to the post.
-- The same post file may be used by several events, so s3_key is now unique per
-- event. Uploaded files stay unique anyway: their key has the event folder and a
-- random suffix.
ALTER TABLE "event_materials" ADD COLUMN "post_slug" TEXT;

DROP INDEX "event_materials_s3_key_key";

CREATE UNIQUE INDEX "event_materials_event_id_s3_key_key" ON "event_materials"("event_id", "s3_key");

CREATE INDEX "event_materials_post_slug_idx" ON "event_materials"("post_slug");
