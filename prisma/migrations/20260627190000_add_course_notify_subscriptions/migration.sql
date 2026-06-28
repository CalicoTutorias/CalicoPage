CREATE TABLE "course_notify_subscriptions" (
  "id" TEXT NOT NULL,
  "student_id" TEXT NOT NULL,
  "course_id" TEXT NOT NULL,
  "notification_email" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'unknown',
  "notified_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "course_notify_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "course_notify_subscriptions_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "course_notify_subscriptions_course_id_fkey"
    FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "course_notify_subscriptions_course_status_idx"
  ON "course_notify_subscriptions"("course_id", "notified_at", "cancelled_at");

CREATE INDEX "course_notify_subscriptions_student_course_idx"
  ON "course_notify_subscriptions"("student_id", "course_id");

CREATE UNIQUE INDEX "course_notify_subscriptions_one_pending_per_student_course_idx"
  ON "course_notify_subscriptions"("student_id", "course_id")
  WHERE "notified_at" IS NULL AND "cancelled_at" IS NULL;
