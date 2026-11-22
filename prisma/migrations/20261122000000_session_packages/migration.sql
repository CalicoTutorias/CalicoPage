-- Paquetes de horas para tutorías manuales: el estudiante acuerda N horas con
-- un tutor en una materia y el nivel (descuento y qué parte pone el tutor) sale
-- de las horas acordadas. Cada pago de una tutoría del paquete apunta a él.

CREATE TYPE "SessionPackageStatusEnum" AS ENUM ('ACTIVE', 'CLOSED');

CREATE TABLE "session_packages" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "committed_minutes" INTEGER NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL,
    "tutor_share_percent" DECIMAL(5,2) NOT NULL,
    "status" "SessionPackageStatusEnum" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "closed_by_id" TEXT,
    "used_minutes" INTEGER,
    "settlement_amount" DECIMAL(10,2),

    CONSTRAINT "session_packages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "session_packages_student_id_tutor_id_course_id_status_idx" ON "session_packages"("student_id", "tutor_id", "course_id", "status");
CREATE INDEX "session_packages_status_created_at_idx" ON "session_packages"("status", "created_at" DESC);

ALTER TABLE "session_packages" ADD CONSTRAINT "session_packages_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "session_packages" ADD CONSTRAINT "session_packages_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "session_packages" ADD CONSTRAINT "session_packages_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "session_packages" ADD CONSTRAINT "session_packages_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "session_packages" ADD CONSTRAINT "session_packages_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments" ADD COLUMN "package_id" TEXT;
CREATE INDEX "payments_package_id_idx" ON "payments"("package_id");
ALTER TABLE "payments" ADD CONSTRAINT "payments_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "session_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
