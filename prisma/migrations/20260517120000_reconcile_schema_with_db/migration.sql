-- Reconcile migration: schema.prisma <-> live DB (DB is the source of truth).
--
-- The live (shared, production) database ALREADY reflects every statement
-- below. This migration exists only as bookkeeping so the migration history
-- matches the actual database and schema.prisma. It was registered with
-- `prisma migrate resolve --applied` and MUST NOT be executed against the
-- live database (doing so is redundant and would lock populated tables).
--
-- Captured via: prisma migrate diff --from-schema <prev> --to-schema <current> --script
-- Verified zero drift: prisma migrate diff --from-schema prisma/schema.prisma --to-config-datasource --exit-code => 0

-- DropForeignKey
ALTER TABLE "course_prices" DROP CONSTRAINT IF EXISTS "course_prices_course_id_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_cancelled_by_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_session_id_fkey";

-- AlterTable
ALTER TABLE "course_prices" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "session_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "course_prices" ADD CONSTRAINT "course_prices_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
