# Deuda técnica: historial de migraciones Prisma roto

> **Estado:** PENDIENTE — no urgente, no afecta a usuarios ni a los datos.
> **Detectado:** 2026-05-22, al intentar `npm run db:migrate` para agregar `Course.aliases`.
> **Impacto inmediato:** `prisma migrate dev` está bloqueado; los cambios de schema deben hacerse con `prisma db push` mientras tanto.

---

## El problema

`prisma migrate dev` valida cada cambio creando una **shadow database** temporal y replayeando *todas* las migraciones desde cero. Ese replay **falla** con:

```
Error: P3006
Migration `20260509180000_add_review_course_id` failed to apply cleanly to the shadow database.
Error: column "tutor_id" does not exist
```

Es decir: el historial de migraciones ya **no puede reconstruir la base de datos desde cero**. Está desincronizado de la BBDD real.

## Causa raíz

La tabla `reviews` se reformó **directamente sobre la BBDD** (con `db push` o SQL manual) y esos cambios **nunca se guardaron como migración**. Evolución según el historial vs. realidad:

- **Lo que las migraciones construyen para `reviews`:**
  `{ id, session_id, comment, created_at, reviewer_id, reviewee_id, score, course_id }`
- **Lo que la BBDD viva y `schema.prisma` realmente tienen:**
  `{ id, session_id, student_id, tutor_id, course_id, rating, status, comment }`

O sea: `reviewee_id` → `tutor_id`, `score` → `rating`, se agregaron `student_id` y `status`… y nada de eso quedó en una migración.

El síntoma puntual: la migración `20260509180000_add_review_course_id` crea un índice sobre `reviews("tutor_id", "course_id", "status")`, pero según el historial esas columnas nunca se crearon → la shadow database explota al replayear.

La divergencia empieza en la migración del **31-mar** (`20260331214253_add_departments_and_careers`) y sigue en la del **9-may**. La migración "reconcile" del 17-may (`20260517120000_reconcile_schema_with_db`) solo arregló FKs de `course_prices`/`payments`/`sessions` — **no** capturó la reforma de `reviews`.

## Por qué importa

- `migrate dev` queda inutilizable para todo el equipo: cualquier cambio de schema futuro debe hacerse con `db push` (saltándose el historial), lo que **agranda la deuda** cada vez.

## Por qué NO es urgente

- La **BBDD de producción está sana y completa** — tiene todas las columnas correctas. El problema es solo de "papeleo" del historial.
- `schema.prisma` **coincide** con la BBDD viva (verificado con `prisma migrate diff ... --exit-code` → sin drift salvo lo que se agregue con `db push`).
- `db push` permite seguir trabajando sin bloqueos.
- No hay riesgo de pérdida de datos ni de comportamiento incorrecto en runtime. Es deuda de **proceso/herramientas**, no un bug.

---

## La solución: re-baselinear

### Por qué re-baselinear (y no editar las migraciones viejas)

Editar migraciones ya aplicadas **rompe sus checksums** → Prisma detecta que fueron modificadas y querrá **resetear** la BBDD. En prod eso es inaceptable. Además son renames (`reviewee_id`→`tutor_id`, `score`→`rating`), no solo columnas nuevas.

El enfoque limpio y documentado por Prisma para historial muy drifteado es **re-baselinear**: archivar las migraciones viejas (ya están todas aplicadas en prod) y reemplazarlas por **una sola migración `0_init`** que refleje el schema actual exacto. Como prod ya tiene todo eso, esa migración se marca como "ya aplicada" sin re-ejecutarla.

> **Clave de seguridad:** en todo este proceso las tablas reales (`users`, `courses`, `reviews`…) **NO se tocan**. Lo único que se modifica en prod es la tabla de contabilidad `_prisma_migrations`. Cero riesgo de pérdida de datos — el riesgo está en dejar bien esa contabilidad para que un futuro `migrate dev` no intente resetear.

### Plan por fases (PowerShell)

#### Fase 0 — Red de seguridad (NO opcional sobre prod compartida)
1. **Snapshot de RDS** desde la consola de AWS (botón "Take snapshot" en la instancia `calico`). Es la marcha-atrás real.
2. Commit del estado actual para revertir lo local:
   ```powershell
   git add -A; git commit -m "checkpoint antes de re-baseline de migraciones"
   ```

#### Fase 1 — Local, reversible, NO toca prod
Archiva las migraciones viejas y genera el baseline desde el schema (usar `--output` para que PowerShell no escriba el `.sql` en UTF-16 y lo corrompa):
```powershell
Move-Item prisma\migrations prisma\migrations_backup
New-Item -ItemType Directory -Force prisma\migrations\0_init | Out-Null
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script --output prisma/migrations/0_init/migration.sql
```
Revisar que `0_init/migration.sql` tenga los `CREATE TABLE` de todo el schema (incluida `courses.aliases` y la `reviews` con `tutor_id`/`status`/`rating`).

#### Fase 2 — Ensayo en copia (muy recomendado)
Antes de tocar prod: restaurar un dump en una BBDD local/temporal, apuntar `DATABASE_URL` ahí y correr `npx prisma migrate dev`. Si reproduce el schema sin errores, el baseline es correcto. Esto evita sorpresas en prod.

#### Fase 3 — Único paso que toca prod (solo `_prisma_migrations`)
Resetear la contabilidad vieja y marcar el baseline como aplicado:
```powershell
'DELETE FROM "_prisma_migrations";' | Out-File -Encoding utf8 reset_pm.sql
npx prisma db execute --file reset_pm.sql --schema prisma/schema.prisma
npx prisma migrate resolve --applied 0_init
Remove-Item reset_pm.sql
```

#### Fase 4 — Verificar
```powershell
npx prisma migrate status
```
Debe decir "Database schema is up to date" / "No pending migrations". A partir de ahí `migrate dev` vuelve a funcionar.

### Recomendación de cómo proceder

Es delicado y es BBDD compartida, así que no dispararlo todo de corrido:
- Fase 0 (snapshot) primero, siempre.
- Fase 1 es local y reversible — generar y revisar el `0_init` con calma.
- Fase 2 (ensayo en copia) antes de tocar prod.
- Fase 3 ejecutarla con cuidado, validando la salida de cada comando.

> ⚠️ **Coordinación con el equipo:** si hay más gente con la BBDD/migraciones viejas, tras re-baselinear **todos deben re-clonar el folder de migraciones**, porque su `_prisma_migrations` local quedaría desincronizado.

---

## Referencia rápida del workaround actual

Mientras la deuda no se resuelva, para cambios de schema **no usar `migrate dev`**. En su lugar:
1. Previsualizar (solo lectura): `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
2. Aplicar: `npx prisma db push`
