-- When the student actually rated. It is not a plain created_at because the row of
-- a tutoring session is created empty, as a placeholder, long before that moment.
ALTER TABLE "reviews" ADD COLUMN "submitted_at" TIMESTAMP(3);

-- Existing repaso reviews: the moment the survey that created them was sent.
UPDATE "reviews" r
   SET "submitted_at" = s."submitted_at"
  FROM "event_registrations" reg
  JOIN "event_survey_responses" s ON s."registration_id" = reg."id"
 WHERE r."status" = 'done'
   AND r."event_id" = reg."event_id"
   AND r."student_id" = reg."user_id";

-- Existing tutoring reviews: the notification the tutor got when rated, or else
-- the end of the session, which is the earliest it could have been rated.
UPDATE "reviews" r
   SET "submitted_at" = COALESCE(
     (SELECT MIN(n."created_at")
        FROM "notifications" n
       WHERE n."type" = 'review_received'
         AND n."session_id" = r."session_id"
         AND n."user_id" = r."tutor_id"),
     (SELECT se."end_timestamp" FROM "sessions" se WHERE se."id" = r."session_id")
   )
 WHERE r."status" = 'done'
   AND r."session_id" IS NOT NULL
   AND r."submitted_at" IS NULL;
