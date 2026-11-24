-- Varios calendarios de Google por tutor: en modo «eventos = ocupado» se restan
-- los eventos de todos los elegidos (p. ej. el de la universidad y el personal).
-- calendar_sync_id se conserva (guarda el primero) para no romper despliegues
-- en curso; los tutores que ya tenían uno lo heredan como lista de un elemento.

ALTER TABLE "schedules" ADD COLUMN "calendar_sync_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "schedules"
SET "calendar_sync_ids" = ARRAY["calendar_sync_id"]
WHERE "calendar_sync_id" IS NOT NULL;
