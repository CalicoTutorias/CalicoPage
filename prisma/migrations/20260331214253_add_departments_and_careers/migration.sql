/*
  Warnings:

  - You are about to drop the column `course` on the `availabilities` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `availabilities` table. All the data in the column will be lost.
  - You are about to drop the column `end_date_time` on the `availabilities` table. All the data in the column will be lost.
  - You are about to drop the column `event_link` on the `availabilities` table. All the data in the column will be lost.
  - You are about to drop the column `google_event_id` on the `availabilities` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `availabilities` table. All the data in the column will be lost.
  - You are about to drop the column `recurrence_rule` on the `availabilities` table. All the data in the column will be lost.
  - You are about to drop the column `recurring` on the `availabilities` table. All the data in the column will be lost.
  - You are about to drop the column `source_calendar_id` on the `availabilities` table. All the data in the column will be lost.
  - You are about to drop the column `source_calendar_name` on the `availabilities` table. All the data in the column will be lost.
  - You are about to drop the column `start_date_time` on the `availabilities` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `availabilities` table. All the data in the column will be lost.
  - You are about to drop the column `tutor_id` on the `availabilities` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `availabilities` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `courses` table. All the data in the column will be lost.
  - You are about to drop the column `credits` on the `courses` table. All the data in the column will be lost.
  - You are about to drop the column `faculty` on the `courses` table. All the data in the column will be lost.
  - You are about to drop the column `prerequisites` on the `courses` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `courses` table. All the data in the column will be lost.
  - You are about to drop the column `reviewer_email` on the `reviews` table. All the data in the column will be lost.
  - You are about to drop the column `reviewer_name` on the `reviews` table. All the data in the column will be lost.
  - You are about to drop the column `stars` on the `reviews` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `reviews` table. All the data in the column will be lost.
  - The primary key for the `users` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `major_id` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `mfa_backup_codes` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `mfa_configured_at` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `mfa_email_code` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `mfa_email_code_expiry` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `mfa_enabled` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `mfa_method` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `mfa_secret` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `users` table. All the data in the column will be lost.
  - The `id` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `majors` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `slot_bookings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tutoring_sessions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_courses` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[session_id,reviewer_id,reviewee_id]` on the table `reviews` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `day_of_week` to the `availabilities` table without a default value. This is not possible if the table is not empty.
  - Added the required column `end_time` to the `availabilities` table without a default value. This is not possible if the table is not empty.
  - Added the required column `start_time` to the `availabilities` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `availabilities` table without a default value. This is not possible if the table is not empty.
  - Added the required column `base_price` to the `courses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `complexity` to the `courses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `reviewee_id` to the `reviews` table without a default value. This is not possible if the table is not empty.
  - Added the required column `score` to the `reviews` table without a default value. This is not possible if the table is not empty.
  - Added the required column `reviewer_id` to the `reviews` table without a default value. This is not possible if the table is not empty.
  - Added the required column `password_hash` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ComplexityEnum" AS ENUM ('Introductory', 'Foundational', 'Challenging');

-- CreateEnum
CREATE TYPE "SessionTypeEnum" AS ENUM ('Individual', 'Group');

-- CreateEnum
CREATE TYPE "SessionStatusEnum" AS ENUM ('Pending', 'Accepted', 'Rejected', 'Completed', 'Canceled');

-- CreateEnum
CREATE TYPE "LocationTypeEnum" AS ENUM ('Virtual', 'Custom');

-- DropForeignKey
ALTER TABLE "availabilities" DROP CONSTRAINT "availabilities_tutor_id_fkey";

-- DropForeignKey
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_reviewer_id_fkey";

-- DropForeignKey
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_session_id_fkey";

-- DropForeignKey
ALTER TABLE "slot_bookings" DROP CONSTRAINT "slot_bookings_parent_availability_id_fkey";

-- DropForeignKey
ALTER TABLE "slot_bookings" DROP CONSTRAINT "slot_bookings_session_id_fkey";

-- DropForeignKey
ALTER TABLE "slot_bookings" DROP CONSTRAINT "slot_bookings_student_id_fkey";

-- DropForeignKey
ALTER TABLE "slot_bookings" DROP CONSTRAINT "slot_bookings_tutor_id_fkey";

-- DropForeignKey
ALTER TABLE "tutoring_sessions" DROP CONSTRAINT "tutoring_sessions_course_id_fkey";

-- DropForeignKey
ALTER TABLE "tutoring_sessions" DROP CONSTRAINT "tutoring_sessions_student_id_fkey";

-- DropForeignKey
ALTER TABLE "tutoring_sessions" DROP CONSTRAINT "tutoring_sessions_tutor_id_fkey";

-- DropForeignKey
ALTER TABLE "user_courses" DROP CONSTRAINT "user_courses_course_id_fkey";

-- DropForeignKey
ALTER TABLE "user_courses" DROP CONSTRAINT "user_courses_user_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_major_id_fkey";

-- DropIndex
DROP INDEX "availabilities_course_start_date_time_idx";

-- DropIndex
DROP INDEX "availabilities_google_event_id_key";

-- DropIndex
DROP INDEX "availabilities_start_date_time_idx";

-- DropIndex
DROP INDEX "availabilities_tutor_id_start_date_time_idx";

-- DropIndex
DROP INDEX "reviews_session_id_reviewer_email_key";

-- AlterTable
ALTER TABLE "availabilities" DROP COLUMN "course",
DROP COLUMN "created_at",
DROP COLUMN "end_date_time",
DROP COLUMN "event_link",
DROP COLUMN "google_event_id",
DROP COLUMN "location",
DROP COLUMN "recurrence_rule",
DROP COLUMN "recurring",
DROP COLUMN "source_calendar_id",
DROP COLUMN "source_calendar_name",
DROP COLUMN "start_date_time",
DROP COLUMN "title",
DROP COLUMN "tutor_id",
DROP COLUMN "updated_at",
ADD COLUMN     "day_of_week" INTEGER NOT NULL,
ADD COLUMN     "end_time" TIME NOT NULL,
ADD COLUMN     "start_time" TIME NOT NULL,
ADD COLUMN     "user_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "courses" DROP COLUMN "created_at",
DROP COLUMN "credits",
DROP COLUMN "faculty",
DROP COLUMN "prerequisites",
DROP COLUMN "updated_at",
ADD COLUMN     "base_price" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "complexity" "ComplexityEnum" NOT NULL,
ADD COLUMN     "department_id" TEXT;

-- AlterTable
ALTER TABLE "reviews" DROP COLUMN "reviewer_email",
DROP COLUMN "reviewer_name",
DROP COLUMN "stars",
DROP COLUMN "updated_at",
ADD COLUMN     "reviewee_id" INTEGER NOT NULL,
ADD COLUMN     "score" INTEGER NOT NULL,
DROP COLUMN "reviewer_id",
ADD COLUMN     "reviewer_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP CONSTRAINT "users_pkey",
DROP COLUMN "major_id",
DROP COLUMN "mfa_backup_codes",
DROP COLUMN "mfa_configured_at",
DROP COLUMN "mfa_email_code",
DROP COLUMN "mfa_email_code_expiry",
DROP COLUMN "mfa_enabled",
DROP COLUMN "mfa_method",
DROP COLUMN "mfa_secret",
DROP COLUMN "phone",
DROP COLUMN "role",
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "career_id" TEXT,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_tutor_approved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_tutor_requested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "password_hash" TEXT NOT NULL,
ADD COLUMN     "phone_number" TEXT,
ADD COLUMN     "profile_picture_url" TEXT,
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- DropTable
DROP TABLE "majors";

-- DropTable
DROP TABLE "slot_bookings";

-- DropTable
DROP TABLE "tutoring_sessions";

-- DropTable
DROP TABLE "user_courses";

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "careers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,

    CONSTRAINT "careers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_profiles" (
    "user_id" INTEGER NOT NULL,
    "school_email" TEXT NOT NULL,
    "experience_years" INTEGER NOT NULL DEFAULT 0,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "experience_description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_courses" (
    "tutor_id" INTEGER NOT NULL,
    "course_id" TEXT NOT NULL,
    "custom_price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "tutor_courses_pkey" PRIMARY KEY ("tutor_id","course_id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "auto_accept_session" BOOLEAN NOT NULL DEFAULT false,
    "min_booking_notice" INTEGER NOT NULL DEFAULT 24,
    "max_sessions_per_day" INTEGER NOT NULL DEFAULT 5,
    "buffer_time" INTEGER NOT NULL DEFAULT 15,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "tutor_id" INTEGER NOT NULL,
    "session_type" "SessionTypeEnum" NOT NULL,
    "max_capacity" INTEGER NOT NULL DEFAULT 1,
    "start_timestamp" TIMESTAMP(3) NOT NULL,
    "end_timestamp" TIMESTAMP(3) NOT NULL,
    "status" "SessionStatusEnum" NOT NULL DEFAULT 'Pending',
    "location_type" "LocationTypeEnum" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_participants" (
    "session_id" TEXT NOT NULL,
    "student_id" INTEGER NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_participants_pkey" PRIMARY KEY ("session_id","student_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "careers_code_key" ON "careers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_profiles_school_email_key" ON "tutor_profiles"("school_email");

-- CreateIndex
CREATE UNIQUE INDEX "schedules_user_id_key" ON "schedules"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_session_id_reviewer_id_reviewee_id_key" ON "reviews"("session_id", "reviewer_id", "reviewee_id");

-- AddForeignKey
ALTER TABLE "careers" ADD CONSTRAINT "careers_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_career_id_fkey" FOREIGN KEY ("career_id") REFERENCES "careers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_courses" ADD CONSTRAINT "tutor_courses_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "tutor_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_courses" ADD CONSTRAINT "tutor_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewee_id_fkey" FOREIGN KEY ("reviewee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
