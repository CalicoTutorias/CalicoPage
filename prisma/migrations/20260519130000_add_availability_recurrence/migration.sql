-- Add recurrence support to availabilities.
--
-- recurring = true  (default) → weekly repeating block; specific_date is NULL.
--                                Preserves all existing rows without data change.
-- recurring = false            → one-time slot; specific_date holds the exact date;
--                                day_of_week is derived from specific_date and stored
--                                for query convenience.

-- AlterTable
ALTER TABLE "availabilities"
  ADD COLUMN "recurring"      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "specific_date"  DATE;
