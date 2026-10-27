-- Plan de contenido de content-creator: marketing_plans + marketing_plan_entries,
-- y la agenda de cada pieza en marketing_pieces (de qué entrada salió, fecha de
-- publicación prevista y si ya está en Instagram). Solo aditiva: columnas
-- nuevas nullables y tablas nuevas.

-- AlterTable
ALTER TABLE "marketing_pieces" ADD COLUMN     "instagram_published_at" DATE,
ADD COLUMN     "instagram_published_by_id" TEXT,
ADD COLUMN     "plan_entry_key" TEXT,
ADD COLUMN     "planned_for" DATE;

-- CreateTable
CREATE TABLE "marketing_plans" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_plan_entries" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "format" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brief" JSONB,
    "details" JSONB NOT NULL DEFAULT '{}',
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_plan_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketing_plans_key_key" ON "marketing_plans"("key");

-- CreateIndex
CREATE INDEX "marketing_plans_ends_on_idx" ON "marketing_plans"("ends_on");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_plan_entries_key_key" ON "marketing_plan_entries"("key");

-- CreateIndex
CREATE INDEX "marketing_plan_entries_plan_id_date_idx" ON "marketing_plan_entries"("plan_id", "date");

-- CreateIndex
CREATE INDEX "marketing_pieces_plan_entry_key_idx" ON "marketing_pieces"("plan_entry_key");

-- CreateIndex
CREATE INDEX "marketing_pieces_planned_for_idx" ON "marketing_pieces"("planned_for");

-- AddForeignKey
ALTER TABLE "marketing_pieces" ADD CONSTRAINT "marketing_pieces_instagram_published_by_id_fkey" FOREIGN KEY ("instagram_published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_plans" ADD CONSTRAINT "marketing_plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_plans" ADD CONSTRAINT "marketing_plans_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_plan_entries" ADD CONSTRAINT "marketing_plan_entries_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "marketing_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_plan_entries" ADD CONSTRAINT "marketing_plan_entries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_plan_entries" ADD CONSTRAINT "marketing_plan_entries_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

