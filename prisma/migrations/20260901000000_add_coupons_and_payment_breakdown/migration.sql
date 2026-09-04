-- Cupones de descuento en el checkout + desglose del cobro en `payments`.
--
-- Contexto: hasta ahora `payments.amount` era la única columna de dinero y
-- de ella se derivaba TODO (85 % del tutor, comisión Wompi, neto Calico).
-- Con cupones esas magnitudes se separan:
--   original_amount   precio de lista (precio/hora × horas)
--   discount_amount   descuento del cupón (0 sin cupón)
--   amount            lo que Wompi cobró = original_amount − discount_amount
--   tutor_payout_base base del 85 % del tutor: original_amount cuando Calico
--                     asume el descuento, amount cuando es compartido
-- Las filas existentes se rellenan con original = base = amount, así todas
-- las agregaciones siguen valiendo sin condicionales.
--
-- Escrita a mano (no salida de `migrate dev`): el backfill + NOT NULL en dos
-- pasos evita rechazar filas existentes, y el índice único de wompi_id va
-- en una migración aparte (20260901000100) para que un duplicado histórico
-- no bloquee esta.

-- 1. Enums ─────────────────────────────────────────────────────────────
CREATE TYPE "CouponDiscountTypeEnum"     AS ENUM ('PERCENT', 'FIXED');
CREATE TYPE "CouponAbsorberEnum"         AS ENUM ('CALICO', 'SHARED');
CREATE TYPE "CouponRedemptionStatusEnum" AS ENUM ('RESERVED', 'APPROVED', 'RELEASED');

-- 2. coupons ───────────────────────────────────────────────────────────
CREATE TABLE "coupons" (
  "id"                 TEXT NOT NULL,
  "code"               TEXT NOT NULL,
  "description"        TEXT,
  "discount_type"      "CouponDiscountTypeEnum" NOT NULL,
  "discount_value"     DECIMAL(10,2) NOT NULL,
  "absorber"           "CouponAbsorberEnum" NOT NULL DEFAULT 'CALICO',
  "max_redemptions"    INTEGER,
  "per_user_limit"     INTEGER NOT NULL DEFAULT 1,
  "first_session_only" BOOLEAN NOT NULL DEFAULT false,
  "valid_from"         TIMESTAMP(3),
  "valid_until"        TIMESTAMP(3),
  "is_active"          BOOLEAN NOT NULL DEFAULT true,
  "created_by_id"      TEXT,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at"         TIMESTAMP(3),

  CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");
CREATE INDEX "coupons_is_active_deleted_at_idx" ON "coupons"("is_active", "deleted_at");

ALTER TABLE "coupons"
  ADD CONSTRAINT "coupons_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. coupon_redemptions ────────────────────────────────────────────────
-- Una fila por intento de pago que usó un cupón. Nace RESERVED al crear el
-- intento, pasa a APPROVED cuando Wompi aprueba y a RELEASED si el pago
-- falla. Guarda el snapshot del desglose para que editar el cupón después
-- no reescriba la historia.
CREATE TABLE "coupon_redemptions" (
  "id"                TEXT NOT NULL,
  "coupon_id"         TEXT NOT NULL,
  "user_id"           TEXT NOT NULL,
  "intent_reference"  TEXT NOT NULL,
  "status"            "CouponRedemptionStatusEnum" NOT NULL DEFAULT 'RESERVED',
  "original_amount"   DECIMAL(10,2) NOT NULL,
  "discount_amount"   DECIMAL(10,2) NOT NULL,
  "final_amount"      DECIMAL(10,2) NOT NULL,
  "tutor_payout_base" DECIMAL(10,2) NOT NULL,
  "absorber"          "CouponAbsorberEnum" NOT NULL,
  "payment_id"        TEXT,
  "session_id"        TEXT,
  "reserved_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_at"       TIMESTAMP(3),
  "released_at"       TIMESTAMP(3),

  CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coupon_redemptions_intent_reference_key" ON "coupon_redemptions"("intent_reference");
CREATE UNIQUE INDEX "coupon_redemptions_payment_id_key"       ON "coupon_redemptions"("payment_id");
CREATE INDEX "coupon_redemptions_coupon_id_status_reserved_at_idx"
  ON "coupon_redemptions"("coupon_id", "status", "reserved_at");
CREATE INDEX "coupon_redemptions_user_id_coupon_id_status_idx"
  ON "coupon_redemptions"("user_id", "coupon_id", "status");

-- RESTRICT: un cupón con redenciones nunca se borra físicamente (la app hace
-- borrado lógico); la base de datos lo garantiza también.
ALTER TABLE "coupon_redemptions"
  ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey"
  FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coupon_redemptions"
  ADD CONSTRAINT "coupon_redemptions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coupon_redemptions"
  ADD CONSTRAINT "coupon_redemptions_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "coupon_redemptions"
  ADD CONSTRAINT "coupon_redemptions_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. payments: desglose del cobro ──────────────────────────────────────
-- 4a. Columnas nuevas, las obligatorias primero como NULL para no rechazar
--     las filas existentes.
ALTER TABLE "payments"
  ADD COLUMN "original_amount"   DECIMAL(10,2),
  ADD COLUMN "discount_amount"   DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "tutor_payout_base" DECIMAL(10,2),
  ADD COLUMN "coupon_id"         TEXT;

-- 4b. Backfill: sin cupón, precio de lista = base del tutor = monto cobrado.
UPDATE "payments"
SET "original_amount"   = "amount",
    "tutor_payout_base" = "amount"
WHERE "original_amount" IS NULL
   OR "tutor_payout_base" IS NULL;

-- 4c. Falla ruidosamente si algo quedó sin rellenar (no debería pasar).
DO $$
DECLARE
  missing INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing
  FROM "payments"
  WHERE "original_amount" IS NULL OR "tutor_payout_base" IS NULL;

  IF missing > 0 THEN
    RAISE EXCEPTION 'payments: % filas sin original_amount/tutor_payout_base tras el backfill', missing;
  END IF;
END $$;

-- 4d. Ahora sí obligatorias.
ALTER TABLE "payments"
  ALTER COLUMN "original_amount"   SET NOT NULL,
  ALTER COLUMN "tutor_payout_base" SET NOT NULL;

-- 4e. Índice + FK al cupón. RESTRICT: un cupón referenciado por pagos no se
--     puede borrar físicamente.
CREATE INDEX "payments_coupon_id_idx" ON "payments"("coupon_id");
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_coupon_id_fkey"
  FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── ROLLBACK (manual, solo junto con revertir el código: el cliente de
-- Prisma seleccionaría las columnas nuevas) ───────────────────────────────
-- ALTER TABLE "payments" DROP CONSTRAINT "payments_coupon_id_fkey";
-- DROP INDEX "payments_coupon_id_idx";
-- ALTER TABLE "payments"
--   DROP COLUMN "coupon_id",
--   DROP COLUMN "tutor_payout_base",
--   DROP COLUMN "discount_amount",
--   DROP COLUMN "original_amount";
-- DROP TABLE "coupon_redemptions";
-- DROP TABLE "coupons";
-- DROP TYPE "CouponRedemptionStatusEnum";
-- DROP TYPE "CouponAbsorberEnum";
-- DROP TYPE "CouponDiscountTypeEnum";
