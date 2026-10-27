-- Repasos con aprobación manual y material de estudio.
--  - events.requires_approval: la inscripción queda PendingApproval hasta que
--    un admin la aprueba (el pago se coordina por fuera, p. ej. transferencia).
--  - event_registrations.reviewed_at / reviewed_by_id: quién y cuándo aprobó
--    o rechazó.
--  - event_materials: archivos en S3 privado (event-materials/…) que solo
--    descargan los inscritos Confirmed que respondieron la encuesta.
-- Solo aditiva.

-- AlterEnum
-- PostgreSQL ≥ 12 acepta varios ADD VALUE en una migración mientras ningún
-- valor nuevo se use en ella.
ALTER TYPE "EventRegistrationStatusEnum" ADD VALUE 'PendingApproval';
ALTER TYPE "EventRegistrationStatusEnum" ADD VALUE 'Rejected';

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "requires_approval" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "event_registrations" ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by_id" TEXT;

-- CreateTable
CREATE TABLE "event_materials" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_materials_s3_key_key" ON "event_materials"("s3_key");

-- CreateIndex
CREATE INDEX "event_materials_event_id_created_at_idx" ON "event_materials"("event_id", "created_at");

-- AddForeignKey
ALTER TABLE "event_materials" ADD CONSTRAINT "event_materials_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
