-- Post-event attendance link: private code of a free event that took place
-- without prior sign-ups. NULL = the link is closed (every existing event).
ALTER TABLE "events" ADD COLUMN "attendance_code" TEXT;
