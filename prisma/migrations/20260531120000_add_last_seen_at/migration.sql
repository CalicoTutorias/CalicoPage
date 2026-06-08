-- Track the user's last activity in the app ("last seen"), for engagement
-- metrics (active students / tutors in the last week). Refreshed on login
-- AND on the /api/auth/me heartbeat (throttled), because the JWT session
-- persists and a user may never log in again explicitly.
-- Existing rows get NULL (never seen since this column existed) and are
-- treated as "not active" until their next visit writes a timestamp.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP(3);
