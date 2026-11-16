-- Libro de movimientos de Calico (docs/specs/finance-ledger.md).
-- Aditiva: tablas nuevas y columnas opcionales; ningún dato existente cambia.

-- CreateEnum
CREATE TYPE "FinanceAccountTypeEnum" AS ENUM ('WOMPI', 'BANK', 'CASH');
CREATE TYPE "LedgerDirectionEnum" AS ENUM ('IN', 'OUT');
CREATE TYPE "LedgerEntryTypeEnum" AS ENUM (
  'OPENING_BALANCE', 'SESSION_CHARGE', 'EVENT_CHARGE', 'WOMPI_FEE', 'TUTOR_PAYOUT',
  'EVENT_TUTOR_PAYOUT', 'GMF', 'REFUND', 'TRANSFER', 'EXPENSE', 'OTHER_INCOME',
  'ADJUSTMENT', 'REVERSAL'
);

-- CreateTable
CREATE TABLE "finance_accounts" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "FinanceAccountTypeEnum" NOT NULL,
  "gmf_applies" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finance_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "finance_accounts_name_key" ON "finance_accounts"("name");

CREATE TABLE "finance_settings" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "cutoff_date" TIMESTAMP(3),
  "gmf_rate" DECIMAL(6,5) NOT NULL DEFAULT 0.004,
  "wompi_account_id" TEXT,
  "default_bank_account_id" TEXT,
  "default_manual_account_id" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by_id" TEXT,
  CONSTRAINT "finance_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "expense_categories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

CREATE TABLE "ledger_entries" (
  "id" TEXT NOT NULL,
  "type" "LedgerEntryTypeEnum" NOT NULL,
  "direction" "LedgerDirectionEnum" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "account_id" TEXT NOT NULL,
  "effective_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source_key" TEXT,
  "source_type" TEXT,
  "source_id" TEXT,
  "is_estimate" BOOLEAN NOT NULL DEFAULT false,
  "exclude_from_profit" BOOLEAN NOT NULL DEFAULT false,
  "category_id" TEXT,
  "description" TEXT,
  "proof_s3_key" TEXT,
  "transfer_group_id" TEXT,
  "reverses_id" TEXT,
  "tutor_id" TEXT,
  "created_by_id" TEXT,
  CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ledger_entries_amount_positive" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "ledger_entries_source_key_key" ON "ledger_entries"("source_key");
CREATE UNIQUE INDEX "ledger_entries_reverses_id_key" ON "ledger_entries"("reverses_id");
CREATE INDEX "ledger_entries_account_id_effective_at_idx" ON "ledger_entries"("account_id", "effective_at");
CREATE INDEX "ledger_entries_effective_at_idx" ON "ledger_entries"("effective_at");
CREATE INDEX "ledger_entries_type_effective_at_idx" ON "ledger_entries"("type", "effective_at");

ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "finance_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reverses_id_fkey"
  FOREIGN KEY ("reverses_id") REFERENCES "ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only: la aplicación nunca edita ni borra un movimiento.
CREATE OR REPLACE FUNCTION ledger_entries_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only: corrige con un REVERSAL';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_entries_no_update_delete
  BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_append_only();

-- AlterTable: events
ALTER TABLE "events" ADD COLUMN "tutor_min_payout" DECIMAL(10,2);

-- AlterTable: payments
ALTER TABLE "payments"
  ADD COLUMN "tutor_payout_account_id" TEXT,
  ADD COLUMN "tutor_payout_proof_s3_key" TEXT,
  ADD COLUMN "refund_status" "EventRefundStatusEnum" NOT NULL DEFAULT 'None',
  ADD COLUMN "refund_amount" DECIMAL(10,2),
  ADD COLUMN "refund_reason" TEXT,
  ADD COLUMN "refunded_at" TIMESTAMP(3),
  ADD COLUMN "refunded_by_id" TEXT,
  ADD COLUMN "refund_account_id" TEXT,
  ADD COLUMN "refund_proof_s3_key" TEXT;
ALTER TABLE "payments" ADD CONSTRAINT "payments_tutor_payout_account_id_fkey"
  FOREIGN KEY ("tutor_payout_account_id") REFERENCES "finance_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_account_id_fkey"
  FOREIGN KEY ("refund_account_id") REFERENCES "finance_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: event_payments
ALTER TABLE "event_payments"
  ADD COLUMN "refund_amount" DECIMAL(10,2),
  ADD COLUMN "refund_account_id" TEXT,
  ADD COLUMN "refund_proof_s3_key" TEXT;
ALTER TABLE "event_payments" ADD CONSTRAINT "event_payments_refund_account_id_fkey"
  FOREIGN KEY ("refund_account_id") REFERENCES "finance_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: event_tutor_payouts
ALTER TABLE "event_tutor_payouts"
  ADD COLUMN "account_id" TEXT,
  ADD COLUMN "proof_s3_key" TEXT;
ALTER TABLE "event_tutor_payouts" ADD CONSTRAINT "event_tutor_payouts_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "finance_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed: cuentas y categorías iniciales (editables desde el admin).
INSERT INTO "finance_accounts" ("id", "name", "type", "gmf_applies") VALUES
  (gen_random_uuid()::text, 'Wompi', 'WOMPI', false),
  (gen_random_uuid()::text, 'Banco', 'BANK', true),
  (gen_random_uuid()::text, 'Efectivo / Nequi', 'CASH', false);

INSERT INTO "finance_settings" ("id", "wompi_account_id", "default_bank_account_id", "default_manual_account_id", "updated_at")
SELECT 1,
  (SELECT "id" FROM "finance_accounts" WHERE "name" = 'Wompi'),
  (SELECT "id" FROM "finance_accounts" WHERE "name" = 'Banco'),
  (SELECT "id" FROM "finance_accounts" WHERE "name" = 'Banco'),
  CURRENT_TIMESTAMP;

INSERT INTO "expense_categories" ("id", "name") VALUES
  (gen_random_uuid()::text, 'Pauta y marketing'),
  (gen_random_uuid()::text, 'Merch'),
  (gen_random_uuid()::text, 'Eventos y almuerzos'),
  (gen_random_uuid()::text, 'Tecnología'),
  (gen_random_uuid()::text, 'Comisiones bancarias'),
  (gen_random_uuid()::text, 'Otros');
