-- `payments.wompi_id` pasa a ser único.
--
-- La deduplicación de pagos era "leer y luego escribir" en
-- wompi.service.processSuccessfulPayment: un webhook y un confirm-payment
-- concurrentes para la misma transacción podían crear dos pagos y acreditar
-- dos veces al tutor. Con el índice único la base de datos lo impide.
-- NULL sigue permitido (tutorías manuales no tienen transacción Wompi) y
-- Postgres no considera iguales dos NULL en un índice único.
--
-- Va separada de 20260901000000 a propósito: si existiera un duplicado
-- histórico, esta migración falla sola y se resuelve a mano sin bloquear
-- la de cupones.
DO $$
DECLARE
  dupes TEXT;
BEGIN
  SELECT string_agg("wompi_id", ', ') INTO dupes
  FROM (
    SELECT "wompi_id"
    FROM "payments"
    WHERE "wompi_id" IS NOT NULL
    GROUP BY "wompi_id"
    HAVING COUNT(*) > 1
  ) d;

  IF dupes IS NOT NULL THEN
    RAISE EXCEPTION 'payments.wompi_id duplicado (resolver a mano antes de crear el índice único): %', dupes;
  END IF;
END $$;

CREATE UNIQUE INDEX "payments_wompi_id_key" ON "payments"("wompi_id");

-- ─── ROLLBACK ───────────────────────────────────────────────────────────
-- DROP INDEX "payments_wompi_id_key";
