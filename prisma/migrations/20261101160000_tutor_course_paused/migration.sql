-- A tutor can stop offering a course they were approved for and resume it later
-- without going through an admin. PostgreSQL ≥ 12 accepts ADD VALUE here because
-- nothing in this migration uses the new value.
ALTER TYPE "TutorCourseStatusEnum" ADD VALUE 'Paused';
