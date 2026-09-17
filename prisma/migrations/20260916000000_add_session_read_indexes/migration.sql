-- Supports the student-session listing/stats relation filter and tutor dashboard queries.
CREATE INDEX "session_participants_student_session_idx"
  ON "session_participants"("student_id", "session_id");

CREATE INDEX "sessions_tutor_status_start_timestamp_idx"
  ON "sessions"("tutor_id", "status", "start_timestamp" DESC);
