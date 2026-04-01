-- CreateEnum
CREATE TYPE "TutorApplicationStatusEnum" AS ENUM ('Pending', 'Approved', 'Rejected');

-- CreateTable
CREATE TABLE "tutor_applications" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "reasons_to_teach" TEXT NOT NULL,
    "subjects" TEXT[],
    "contact_info" JSONB NOT NULL,
    "status" "TutorApplicationStatusEnum" NOT NULL DEFAULT 'Pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_applications_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tutor_applications" ADD CONSTRAINT "tutor_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
