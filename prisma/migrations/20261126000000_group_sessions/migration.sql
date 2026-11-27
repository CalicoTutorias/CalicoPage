-- Tutorías grupales: quien agenda paga todos los cupos (hasta 6 personas,
-- contándose) e invita a los demás por correo. Cada persona extra suma
-- 10.000 COP por hora al precio de la tutoría.
--
-- Todo es aditivo y con valores por defecto, así que el código anterior sigue
-- funcionando con la base ya migrada: aplicar ANTES de desplegar.

-- Personas máximas que acepta cada tutor por tutoría (1 = no acepta grupales).
ALTER TABLE "schedules" ADD COLUMN "max_group_size" INTEGER NOT NULL DEFAULT 6;

-- Recargo grupal incluido en original_amount (0 en las individuales).
ALTER TABLE "payments" ADD COLUMN "group_surcharge" DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE TYPE "SessionInvitationStatusEnum" AS ENUM ('Pending', 'Accepted', 'Declined', 'Revoked');

CREATE TABLE "session_invitations" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "SessionInvitationStatusEnum" NOT NULL DEFAULT 'Pending',
    "invited_by_id" TEXT NOT NULL,
    "accepted_by_id" TEXT,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "last_sent_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "session_invitations_token_hash_key" ON "session_invitations"("token_hash");
CREATE UNIQUE INDEX "session_invitations_session_id_email_key" ON "session_invitations"("session_id", "email");
CREATE INDEX "session_invitations_email_status_idx" ON "session_invitations"("email", "status");

ALTER TABLE "session_invitations" ADD CONSTRAINT "session_invitations_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "session_invitations" ADD CONSTRAINT "session_invitations_invited_by_id_fkey"
    FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "session_invitations" ADD CONSTRAINT "session_invitations_accepted_by_id_fkey"
    FOREIGN KEY ("accepted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
