-- CreateTable
CREATE TABLE "majors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "faculty" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "majors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "credits" INTEGER,
    "faculty" TEXT,
    "prerequisites" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'student',
    "major_id" TEXT,
    "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
    "verification_token" TEXT,
    "reset_token" TEXT,
    "reset_token_expiry" TIMESTAMP(3),
    "otp_code" TEXT,
    "otp_code_expiry" TIMESTAMP(3),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_method" TEXT,
    "mfa_secret" TEXT,
    "mfa_backup_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mfa_configured_at" TIMESTAMP(3),
    "mfa_email_code" TEXT,
    "mfa_email_code_expiry" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_courses" (
    "user_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,

    CONSTRAINT "user_courses_pkey" PRIMARY KEY ("user_id","course_id")
);

-- CreateTable
CREATE TABLE "availabilities" (
    "id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "title" TEXT,
    "location" TEXT,
    "start_date_time" TIMESTAMP(3) NOT NULL,
    "end_date_time" TIMESTAMP(3) NOT NULL,
    "google_event_id" TEXT,
    "event_link" TEXT,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrence_rule" TEXT,
    "source_calendar_id" TEXT,
    "source_calendar_name" TEXT,
    "course" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutoring_sessions" (
    "id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "tutor_email" TEXT,
    "student_email" TEXT,
    "student_name" TEXT,
    "scheduled_start" TIMESTAMP(3) NOT NULL,
    "scheduled_end" TIMESTAMP(3) NOT NULL,
    "course" TEXT,
    "course_id" TEXT,
    "location" TEXT,
    "price" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payment_status" TEXT NOT NULL DEFAULT 'pending',
    "tutor_approval_status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "parent_availability_id" TEXT,
    "slot_index" INTEGER,
    "slot_id" TEXT,
    "google_event_id" TEXT,
    "calico_calendar_event_id" TEXT,
    "calico_calendar_html_link" TEXT,
    "meet_link" TEXT,
    "rating" DOUBLE PRECISION,
    "average_rating" DOUBLE PRECISION,
    "requested_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" TEXT,
    "completed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutoring_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "reviewer_email" TEXT NOT NULL,
    "reviewer_name" TEXT,
    "reviewer_id" TEXT,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_bookings" (
    "id" TEXT NOT NULL,
    "parent_availability_id" TEXT NOT NULL,
    "slot_index" INTEGER NOT NULL,
    "slot_id" TEXT,
    "tutor_id" TEXT NOT NULL,
    "tutor_email" TEXT,
    "student_id" TEXT NOT NULL,
    "student_email" TEXT,
    "session_id" TEXT,
    "slot_start_time" TIMESTAMP(3) NOT NULL,
    "slot_end_time" TIMESTAMP(3) NOT NULL,
    "course" TEXT,
    "booked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slot_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "majors_code_key" ON "majors"("code");

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_key" ON "courses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "availabilities_google_event_id_key" ON "availabilities"("google_event_id");

-- CreateIndex
CREATE INDEX "availabilities_tutor_id_start_date_time_idx" ON "availabilities"("tutor_id", "start_date_time");

-- CreateIndex
CREATE INDEX "availabilities_course_start_date_time_idx" ON "availabilities"("course", "start_date_time");

-- CreateIndex
CREATE INDEX "availabilities_start_date_time_idx" ON "availabilities"("start_date_time");

-- CreateIndex
CREATE INDEX "tutoring_sessions_tutor_id_scheduled_start_idx" ON "tutoring_sessions"("tutor_id", "scheduled_start" DESC);

-- CreateIndex
CREATE INDEX "tutoring_sessions_student_id_scheduled_start_idx" ON "tutoring_sessions"("student_id", "scheduled_start" DESC);

-- CreateIndex
CREATE INDEX "tutoring_sessions_tutor_id_tutor_approval_status_scheduled__idx" ON "tutoring_sessions"("tutor_id", "tutor_approval_status", "scheduled_start" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "reviews_session_id_reviewer_email_key" ON "reviews"("session_id", "reviewer_email");

-- CreateIndex
CREATE INDEX "slot_bookings_tutor_id_slot_start_time_idx" ON "slot_bookings"("tutor_id", "slot_start_time" DESC);

-- CreateIndex
CREATE INDEX "slot_bookings_session_id_idx" ON "slot_bookings"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "slot_bookings_parent_availability_id_slot_index_key" ON "slot_bookings"("parent_availability_id", "slot_index");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_major_id_fkey" FOREIGN KEY ("major_id") REFERENCES "majors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_courses" ADD CONSTRAINT "user_courses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_courses" ADD CONSTRAINT "user_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutoring_sessions" ADD CONSTRAINT "tutoring_sessions_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutoring_sessions" ADD CONSTRAINT "tutoring_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutoring_sessions" ADD CONSTRAINT "tutoring_sessions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "tutoring_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_bookings" ADD CONSTRAINT "slot_bookings_parent_availability_id_fkey" FOREIGN KEY ("parent_availability_id") REFERENCES "availabilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_bookings" ADD CONSTRAINT "slot_bookings_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_bookings" ADD CONSTRAINT "slot_bookings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_bookings" ADD CONSTRAINT "slot_bookings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "tutoring_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
