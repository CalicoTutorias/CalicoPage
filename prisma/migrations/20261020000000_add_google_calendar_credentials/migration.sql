-- Credenciales OAuth de Google Calendar por tutor. Hasta ahora vivían solo en
-- cookies HttpOnly del navegador (30 días, un solo dispositivo), así que el
-- servidor no podía saber si el tutor seguía conectado ni actuar sin él.
-- Los tokens se guardan cifrados (AES-256-GCM, ver src/lib/security/secret-box.js).
-- Solo aditiva.

-- CreateTable
CREATE TABLE "google_calendar_credentials" (
    "user_id" TEXT NOT NULL,
    "refresh_token_encrypted" TEXT NOT NULL,
    "access_token_encrypted" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_credentials_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "google_calendar_credentials" ADD CONSTRAINT "google_calendar_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
