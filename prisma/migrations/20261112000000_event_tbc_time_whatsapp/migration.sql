-- AlterTable
ALTER TABLE "events" ADD COLUMN "time_tbc" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "duration_hours" DOUBLE PRECISION,
ADD COLUMN "whatsapp_url" TEXT;
