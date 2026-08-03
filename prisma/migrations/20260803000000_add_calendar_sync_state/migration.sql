-- Estado persistido de la integración con Google Calendar.
-- Los tokens OAuth solo existen en cookies HttpOnly del navegador del tutor,
-- por lo que el panel de administración no tiene forma de saber si un tutor
-- sigue conectado. Estas columnas son la única señal server-side.
ALTER TABLE "schedules"
  ADD COLUMN "calendar_connected_at"   TIMESTAMP(3),
  ADD COLUMN "calendar_last_synced_at" TIMESTAMP(3),
  ADD COLUMN "calendar_last_sync_ok"   BOOLEAN;

-- Backfill: todo tutor que ya eligió un calendario estaba conectado en algún
-- momento. Sin esto, todos los tutores existentes aparecerían en gris
-- ("nunca conectó") hasta su próxima sincronización.
UPDATE "schedules"
SET "calendar_connected_at" = NOW()
WHERE "calendar_sync_id" IS NOT NULL;
