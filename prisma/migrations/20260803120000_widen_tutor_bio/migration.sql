-- `tutor_profiles.bio` era VARCHAR(200) mientras la API validaba hasta 2000,
-- así que cualquier bio de 201–2000 caracteres pasaba la validación y moría en
-- Postgres con 22001 ("value too long"), que el handler devolvía como un 500
-- genérico. Se ensancha la columna al límite que la API ya declaraba.
--
-- Ensanchar un VARCHAR no reescribe la tabla ni puede fallar por datos
-- existentes: toda fila que cabía en 200 cabe en 2000.
ALTER TABLE "tutor_profiles"
  ALTER COLUMN "bio" TYPE VARCHAR(2000);
