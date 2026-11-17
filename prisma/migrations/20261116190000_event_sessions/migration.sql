-- Repaso dividido en varios días (null = una sola sesión)
ALTER TABLE "events" ADD COLUMN "sessions" JSONB;
