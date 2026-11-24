-- Correo universitario verificado: el sello "Uniandes" del perfil público.
-- Independiente del correo de login (quien entra con Gmail puede verificar su
-- correo @uniandes.edu.co). Solo verified_university se muestra en público.

ALTER TABLE "users"
  ADD COLUMN "university_email" TEXT,
  ADD COLUMN "verified_university" TEXT,
  ADD COLUMN "university_email_verified_at" TIMESTAMP(3),
  ADD COLUMN "pending_university_email" TEXT,
  ADD COLUMN "university_email_token" TEXT,
  ADD COLUMN "university_email_token_expiry" TIMESTAMP(3),
  ADD COLUMN "university_email_sent_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_university_email_key" ON "users"("university_email");
CREATE UNIQUE INDEX "users_university_email_token_key" ON "users"("university_email_token");

-- Quien ya verificó un correo @uniandes.edu.co como correo de login (al
-- registrarse, o con Google, que ya viene verificado) ya demostró que es suyo:
-- recibe el sello sin repetir la verificación.
UPDATE "users"
SET "university_email" = lower("email"),
    "verified_university" = 'uniandes',
    "university_email_verified_at" = NOW()
WHERE "kind" = 'Registered'
  AND "is_email_verified" = true
  AND lower("email") LIKE '%@uniandes.edu.co';
