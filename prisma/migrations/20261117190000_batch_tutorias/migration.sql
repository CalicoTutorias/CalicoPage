-- Tutorías en bloque: preferencias del tutor, desglose del descuento por
-- bloque en pagos y configuración admin del descuento.

-- Preferencias de agendamiento del tutor
ALTER TABLE "schedules" ADD COLUMN "max_consecutive_hours" INTEGER NOT NULL DEFAULT 2;
-- La anticipación nunca se validó: los tutores existentes quedan en 2 h para
-- no cortar las reservas de último minuto; los nuevos arrancan en 12 h.
UPDATE "schedules" SET "min_booking_notice" = 2;
ALTER TABLE "schedules" ALTER COLUMN "min_booking_notice" SET DEFAULT 12;

-- Desglose del descuento por bloque en cada pago
ALTER TABLE "payments" ADD COLUMN "batch_discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "payments" ADD COLUMN "batch_absorber" "CouponAbsorberEnum";

-- Configuración del descuento por bloque (una fila)
CREATE TABLE "batch_discount_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "tiers" JSONB NOT NULL DEFAULT '[0, 5, 10, 15]',
    "absorber" "CouponAbsorberEnum" NOT NULL DEFAULT 'SHARED',
    "stacks_with_coupons" BOOLEAN NOT NULL DEFAULT true,
    "applies_to_manual" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "batch_discount_config_pkey" PRIMARY KEY ("id")
);

-- Arranca desactivado: un admin lo activa desde /home/admin/descuentos.
INSERT INTO "batch_discount_config" ("id", "updated_at") VALUES ('default', CURRENT_TIMESTAMP);
