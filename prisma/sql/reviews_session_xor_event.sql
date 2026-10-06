-- A review belongs to a tutoring session OR an event, never both, never neither.
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_session_xor_event;
ALTER TABLE reviews ADD CONSTRAINT reviews_session_xor_event
  CHECK ((session_id IS NULL) <> (event_id IS NULL));
