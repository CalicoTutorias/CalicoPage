-- RemoveSchema: Remove bio column from users table (description is now tutor-only)
ALTER TABLE "users" DROP COLUMN IF EXISTS "bio";
