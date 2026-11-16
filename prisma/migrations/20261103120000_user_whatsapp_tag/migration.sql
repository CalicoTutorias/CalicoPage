-- A manual session may leave the student's WhatsApp tag instead of (or besides)
-- a phone number. Internal contact data, never unique: the email identifies them.
ALTER TABLE "users" ADD COLUMN "whatsapp_tag" TEXT;
