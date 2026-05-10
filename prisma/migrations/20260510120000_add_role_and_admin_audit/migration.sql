-- Phase 1 of the Admin Dashboard plan: introduce the Role enum, suspension
-- fields on users, application-review metadata on tutor_applications, and the
-- append-only admin_audit_log table.

-- 1. Role enum (orthogonal to is_tutor_approved — an admin may also be a tutor)
CREATE TYPE "Role" AS ENUM ('STUDENT', 'ADMIN');

-- 2. New columns on users
ALTER TABLE "users"
  ADD COLUMN "role"             "Role"     NOT NULL DEFAULT 'STUDENT',
  ADD COLUMN "suspended_at"     TIMESTAMP(3),
  ADD COLUMN "suspended_reason" TEXT,
  ADD COLUMN "suspended_by_id"  TEXT;

ALTER TABLE "users"
  ADD CONSTRAINT "users_suspended_by_id_fkey"
  FOREIGN KEY ("suspended_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Application-review metadata (who closed each application and why)
ALTER TABLE "tutor_applications"
  ADD COLUMN "rejection_reason" TEXT,
  ADD COLUMN "reviewed_at"      TIMESTAMP(3),
  ADD COLUMN "reviewed_by_id"   TEXT;

ALTER TABLE "tutor_applications"
  ADD CONSTRAINT "tutor_applications_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Append-only audit log
CREATE TABLE "admin_audit_log" (
  "id"          TEXT        NOT NULL,
  "admin_id"    TEXT        NOT NULL,
  "action"      TEXT        NOT NULL,
  "target_type" TEXT,
  "target_id"   TEXT,
  "payload"     JSONB,
  "ip_address"  TEXT,
  "user_agent"  TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "admin_audit_log"
  ADD CONSTRAINT "admin_audit_log_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "admin_audit_log_admin_id_created_at_idx"
  ON "admin_audit_log" ("admin_id", "created_at" DESC);

CREATE INDEX "admin_audit_log_action_created_at_idx"
  ON "admin_audit_log" ("action", "created_at" DESC);

CREATE INDEX "admin_audit_log_target_type_target_id_idx"
  ON "admin_audit_log" ("target_type", "target_id");
