-- Remove the department dimension from the app schema.
-- Careers and courses now live as flat catalog entities.

ALTER TABLE "careers"
  DROP CONSTRAINT IF EXISTS "careers_department_id_fkey";

ALTER TABLE "courses"
  DROP CONSTRAINT IF EXISTS "courses_department_id_fkey";

ALTER TABLE "careers"
  DROP COLUMN IF EXISTS "department_id";

ALTER TABLE "courses"
  DROP COLUMN IF EXISTS "department_id";

DROP TABLE IF EXISTS "departments";
