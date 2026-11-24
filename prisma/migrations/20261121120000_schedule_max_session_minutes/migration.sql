-- Tutorías de 1 h, 1 h 30 o 2 h. Cada tutor fija la duración máxima que acepta
-- (por defecto 2 h: todos aceptan las tres). El límite diario
-- (max_sessions_per_day) pasa a contar horas; con tutorías de 1 h es lo mismo
-- que antes, así que los valores actuales se conservan.

ALTER TABLE "schedules" ADD COLUMN "max_session_minutes" INTEGER NOT NULL DEFAULT 120;
