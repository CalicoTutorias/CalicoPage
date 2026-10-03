-- Events feature schema diff (generated with prisma migrate diff against main's schema).
-- Apply to production ONLY after review, then run prisma/sql/reviews_session_xor_event.sql.

-- CreateEnum
CREATE TYPE "EventStatusEnum" AS ENUM ('Draft', 'Published', 'Canceled');

-- CreateEnum
CREATE TYPE "EventModalityEnum" AS ENUM ('Virtual', 'InPerson');

-- CreateEnum
CREATE TYPE "EventRegistrationStatusEnum" AS ENUM ('PendingPayment', 'Confirmed', 'Canceled');

-- CreateEnum
CREATE TYPE "EventPaymentFlagEnum" AS ENUM ('DUPLICATE', 'EVENT_CANCELED', 'REGISTRATION_CANCELED', 'EARLY_BIRD_OVERRUN');

-- CreateEnum
CREATE TYPE "EventRefundStatusEnum" AS ENUM ('None', 'Pending', 'Refunded');

-- CreateEnum
CREATE TYPE "PaymentIntentKindEnum" AS ENUM ('session', 'event');

-- DropForeignKey
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_course_id_fkey";

-- AlterTable
ALTER TABLE "payment_intents" ADD COLUMN     "kind" "PaymentIntentKindEnum" NOT NULL DEFAULT 'session';

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "event_id" TEXT,
ALTER COLUMN "session_id" DROP NOT NULL,
ALTER COLUMN "course_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "marketing_opt_in_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cover_image_url" TEXT,
    "course_id" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "modality" "EventModalityEnum" NOT NULL,
    "auto_meet" BOOLEAN NOT NULL DEFAULT false,
    "meeting_url" TEXT,
    "location" TEXT,
    "google_calendar_event_id" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "early_bird_slots" INTEGER,
    "early_bird_percent" INTEGER,
    "is_listed" BOOLEAN NOT NULL DEFAULT true,
    "status" "EventStatusEnum" NOT NULL DEFAULT 'Draft',
    "published_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "last_reminder_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_tutors" (
    "event_id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "event_tutors_pkey" PRIMARY KEY ("event_id","tutor_id")
);

-- CreateTable
CREATE TABLE "event_registrations" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "EventRegistrationStatusEnum" NOT NULL,
    "early_bird" BOOLEAN NOT NULL DEFAULT false,
    "reserved_at" TIMESTAMP(3),
    "list_price" DECIMAL(10,2) NOT NULL,
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "final_amount" DECIMAL(10,2) NOT NULL,
    "intent_reference" TEXT,
    "source" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "canceled_by" TEXT,
    "refund_method" TEXT,
    "refund_method_details" TEXT,
    "survey_reminded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_payments" (
    "id" TEXT NOT NULL,
    "registration_id" TEXT NOT NULL,
    "wompi_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "original_amount" DECIMAL(10,2) NOT NULL,
    "discount_amount" DECIMAL(10,2) NOT NULL,
    "flag" "EventPaymentFlagEnum",
    "refund_status" "EventRefundStatusEnum" NOT NULL DEFAULT 'None',
    "refunded_at" TIMESTAMP(3),
    "refunded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_survey_responses" (
    "id" TEXT NOT NULL,
    "registration_id" TEXT NOT NULL,
    "attended" BOOLEAN NOT NULL,
    "event_rating" INTEGER,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_survey_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_tutor_payouts" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_tutor_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE INDEX "events_status_is_listed_starts_at_idx" ON "events"("status", "is_listed", "starts_at");

-- CreateIndex
CREATE INDEX "event_tutors_tutor_id_idx" ON "event_tutors"("tutor_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_registrations_intent_reference_key" ON "event_registrations"("intent_reference");

-- CreateIndex
CREATE INDEX "event_registrations_event_id_status_early_bird_idx" ON "event_registrations"("event_id", "status", "early_bird");

-- CreateIndex
CREATE INDEX "event_registrations_user_id_status_idx" ON "event_registrations"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "event_registrations_event_id_user_id_key" ON "event_registrations"("event_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_payments_wompi_id_key" ON "event_payments"("wompi_id");

-- CreateIndex
CREATE INDEX "event_payments_registration_id_idx" ON "event_payments"("registration_id");

-- CreateIndex
CREATE INDEX "event_payments_refund_status_idx" ON "event_payments"("refund_status");

-- CreateIndex
CREATE UNIQUE INDEX "event_survey_responses_registration_id_key" ON "event_survey_responses"("registration_id");

-- CreateIndex
CREATE INDEX "event_tutor_payouts_event_id_idx" ON "event_tutor_payouts"("event_id");

-- CreateIndex
CREATE INDEX "reviews_event_id_idx" ON "reviews"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_event_id_student_id_tutor_id_key" ON "reviews"("event_id", "student_id", "tutor_id");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tutors" ADD CONSTRAINT "event_tutors_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tutors" ADD CONSTRAINT "event_tutors_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_payments" ADD CONSTRAINT "event_payments_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_survey_responses" ADD CONSTRAINT "event_survey_responses_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tutor_payouts" ADD CONSTRAINT "event_tutor_payouts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tutor_payouts" ADD CONSTRAINT "event_tutor_payouts_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
