-- Regla de pago a tutores por repaso. Los repasos que ya terminaron se pagaron
-- con la regla vieja (60 000/h desde 8 inscritos + 70 % del excedente) y sus
-- tutores ya recibieron su pago: quedan LEGACY y no aparecen como deuda.
-- Los demás (y los nuevos) usan la regla del mínimo por tutor / 40 % neto.

CREATE TYPE "EventEarningsRuleEnum" AS ENUM ('LEGACY', 'MIN_OR_SHARE');

ALTER TABLE "events" ADD COLUMN "earnings_rule" "EventEarningsRuleEnum" NOT NULL DEFAULT 'MIN_OR_SHARE';

UPDATE "events" SET "earnings_rule" = 'LEGACY' WHERE "ends_at" < NOW();
