-- Solicitudes de cambio de horario: el tutor o el estudiante que agendó
-- propone mover la tutoría (misma duración) y la otra parte acepta o rechaza.
-- Al aceptar, la tutoría, su pago y su evento de Calendar se mueven.
--
-- Solo agrega una tabla y un enum: el código anterior sigue funcionando con
-- la base ya migrada. Aplicar ANTES de desplegar.

CREATE TYPE "SessionRescheduleStatusEnum" AS ENUM ('Pending', 'Accepted', 'Declined', 'Withdrawn', 'Expired');

CREATE TABLE "session_reschedule_requests" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "respondent_id" TEXT NOT NULL,
    "from_start" TIMESTAMP(3) NOT NULL,
    "from_end" TIMESTAMP(3) NOT NULL,
    "to_start" TIMESTAMP(3) NOT NULL,
    "to_end" TIMESTAMP(3) NOT NULL,
    "message" TEXT,
    "status" "SessionRescheduleStatusEnum" NOT NULL DEFAULT 'Pending',
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_reschedule_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "session_reschedule_requests_session_id_status_idx" ON "session_reschedule_requests"("session_id", "status");
CREATE INDEX "session_reschedule_requests_respondent_id_status_idx" ON "session_reschedule_requests"("respondent_id", "status");

ALTER TABLE "session_reschedule_requests" ADD CONSTRAINT "session_reschedule_requests_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "session_reschedule_requests" ADD CONSTRAINT "session_reschedule_requests_requested_by_id_fkey"
    FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "session_reschedule_requests" ADD CONSTRAINT "session_reschedule_requests_respondent_id_fkey"
    FOREIGN KEY ("respondent_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
