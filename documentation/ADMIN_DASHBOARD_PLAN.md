# Plan: Panel de Administración (Admin Dashboard)

> **Audiencia:** equipo Calico.
> **Estado:** Fases 1–5 completadas. Panel admin listo para producción.
> **Última actualización:** 2026-05-10.

## Estado de ejecución

| Fase | Estado | Notas |
|---|---|---|
| 1. DB + modelo | ✅ Completada (2026-05-10) | Schema, migración, AuthContext y `isAdmin` aplicados. |
| 2. Backend RBAC + endpoints de tutores | ✅ Completada (2026-05-10) | `requireAdminUser`, audit log y 5 endpoints listos para Postman. Tests + middleware diferidos. |
| 3. UI: shell, lista y detalle de tutores | ✅ Completada (2026-05-10) | Layout con guard, sidebar, listado por tabs (pending/active/suspended) y detalle con flujo de aprobación por materia. Iteración: per-course assign + inline approve/reject. |
| 4. Dashboard y métricas | ✅ Completada (2026-05-10) | 5 endpoints `/api/admin/metrics/*` con caché TTL 5 min, dashboard con 4 KPIs, 2 charts (Recharts) y 2 rankings. |
| 5. Auditoría, polish, hardening | ✅ Completada (2026-05-10) | UI de audit log, cancelación de sesiones futuras al suspender, emails en approve/reject/suspend, rate limiting 30/min por admin. |

---

## 0. Aclaración de stack

El prompt original menciona **NestJS** y **rutas de React**. El proyecto real es **Next.js 15 (App Router)** monolítico — backend y frontend viven en el mismo paquete:

- API: `src/app/api/.../route.js` (Route Handlers) — no hay NestJS.
- UI: React 19 (RSC + client components) + Tailwind v4 + shadcn/ui.
- DB: PostgreSQL + Prisma.
- Auth actual: JWT propio (`jsonwebtoken`) en `localStorage`.

Todo el plan está adaptado a este stack. Si en el futuro se separa el backend, las decisiones de schema y endpoints son portables.

---

## 1. Feedback de arquitectura

### 1.1 Sobre la idea del `role`

**Veredicto: correcta, con un matiz.** Hoy el rol del tutor está modelado con dos booleans en `users`:

```prisma
isTutorRequested Boolean @default(false)
isTutorApproved  Boolean @default(false)
```

Eso funcionó cuando los únicos roles eran "estudiante" y "tutor aprobado". Para introducir admin (y posibles roles futuros como `MODERATOR` o `SUPPORT`), agregar una **enum `Role`** es lo correcto, **pero con dos consideraciones**:

1. **No reemplaces `isTutorApproved`.** El rol "Tutor" es un rol *adquirido tras una aplicación*; el rol "Admin" es *otorgado manualmente*. Mezclarlos en un único campo enum obliga a que un usuario sea o-tutor-o-admin, lo cual no quieres (un admin podría también ser tutor en una materia). La forma limpia:
   - `Role` enum = `{ STUDENT, ADMIN }` (rol "base" del usuario)
   - `isTutorApproved Boolean` se queda como flag ortogonal (un Admin puede tener `isTutorApproved=true` también si quieres que dicte tutorías).

2. **No metas el rol solo en el JWT.** Si firmas el rol en el token, no se actualiza hasta que el usuario hace login otra vez. Para acciones admin críticas, **lee el rol desde DB en cada request** (o invalida tokens al cambiar el rol). Es una latencia trivial y elimina ataques de "token con rol antiguo".

### 1.2 Defensa en profundidad — 4 capas

Para que un usuario no-admin no pueda **ni ver el menú, ni cargar la ruta, ni llamar al endpoint, ni leer datos**:

| Capa | Dónde | Qué hace |
|---|---|---|
| 1. UI condicional | Header, sidebar | Ocultar el link "Admin" si `!user.isAdmin`. Esto es UX, **nunca seguridad**. |
| 2. Guard de ruta cliente | `app/home/admin/layout.jsx` | Si `!useAuth().user.isAdmin` → redirige a `/home`. |
| 3. Middleware Next.js | `src/middleware.js` (nuevo) | Intercepta TODO request a `/home/admin/**` y `/api/admin/**`, verifica JWT + rol. Devuelve 401/403 o redirige. |
| 4. Guard de endpoint | Cada `route.js` admin | `requireAdminUser(request)` (nuevo) que valida JWT + lee `users.role` de la DB. **No confíes en el rol del JWT.** |

Sólo la capa 4 es la barrera de seguridad real. Las otras tres son UX y defensa redundante.

### 1.3 Reemplazo del `requireAdmin` actual

El guard actual en [src/lib/auth/guards.js](../src/lib/auth/guards.js) usa `x-admin-secret` (un secret compartido vía header). Eso sirve para cron jobs o scripts internos, **no para humanos** (no hay traza de quién hizo qué).

**Plan:**
- Renombrar el actual a `requireAdminSecret(request)` y dejarlo sólo para tareas automatizadas.
- Nuevo `requireAdminUser(request)` que:
  - Llama a `authenticateRequest(request)` (JWT existente).
  - Lee `users.role` desde DB con `auth.sub`.
  - Si `role !== 'ADMIN'` → 403.
  - Si OK → devuelve `{ ...auth, role }`.
- Migrar los endpoints existentes en `/api/admin/**` para que acepten **cualquiera de los dos** durante un periodo de transición, y luego dejar sólo `requireAdminUser` para todo lo que sea acción de un humano.

### 1.4 Auditoría = obligatoria

Todo cambio que un admin haga (aprobar tutor, suspender, ajustar precios, etc.) debe quedar registrado en una tabla `admin_audit_log` con:
- Quién (admin user id)
- Qué (acción + tabla afectada + IDs)
- Cuándo (timestamp)
- Snapshot del payload (JSON)

Esto es indispensable para investigar errores, disputas legales y para que el equipo se cuide entre sí.

### 1.5 Otras prácticas de seguridad

- **Rate limiting** en `/api/admin/**` (ej. 30 req/min por user) — usa el middleware o un wrapper. No tienes hoy; agregar en Fase 2.
- **Validación con Zod** en cada endpoint (ya es patrón del proyecto, mantenerlo).
- **CSRF**: el JWT viaja en `Authorization: Bearer`, no en cookie, así que CSRF clásico no aplica. Mantenlo así — no metas el JWT en cookie.
- **2FA para admins** (Fase 5, opcional): usar TOTP (Google Authenticator). El `User` ya tiene `otpCode`; reutilízalo o agrega `totpSecret`.
- **Audit log inmutable**: no `UPDATE` ni `DELETE` sobre `admin_audit_log`. Sólo `INSERT`. Reforzar con permisos de DB si se quiere ser estricto.
- **Sin "soft admin"**: no se hereda admin por estar en cierta carrera, ni por email "@calico.com". Solo por `role = ADMIN` puesto manualmente vía SQL inicial → luego desde el panel.

---

## 2. Esquema de base de datos

### 2.1 Cambios en `schema.prisma`

```prisma
// ─── NUEVA ENUM ────────────────────────────────────────────
enum Role {
  STUDENT
  ADMIN
}

// ─── USER (cambios) ────────────────────────────────────────
model User {
  // ... campos existentes ...

  role  Role  @default(STUDENT)

  // Moderación
  suspendedAt      DateTime? @map("suspended_at")
  suspendedReason  String?   @map("suspended_reason")
  suspendedById    String?   @map("suspended_by_id")
  suspendedBy      User?     @relation("UserSuspendedBy", fields: [suspendedById], references: [id])
  suspendedUsers   User[]    @relation("UserSuspendedBy")

  // Auditoría inversa (relación opcional para queries)
  adminActions     AdminAuditLog[] @relation("AdminActor")
}

// ─── AUDIT LOG ─────────────────────────────────────────────
model AdminAuditLog {
  id          String   @id @default(uuid())
  adminId     String   @map("admin_id")
  action      String   // "TUTOR_APPROVE" | "TUTOR_SUSPEND" | "COURSE_PRICE_UPDATE" | ...
  targetType  String?  @map("target_type")  // "User" | "TutorApplication" | "Course"
  targetId    String?  @map("target_id")
  payload     Json?    // snapshot de antes/después
  ipAddress   String?  @map("ip_address")
  userAgent   String?  @map("user_agent")
  createdAt   DateTime @default(now()) @map("created_at")

  admin User @relation("AdminActor", fields: [adminId], references: [id])

  @@index([adminId, createdAt(sort: Desc)])
  @@index([action, createdAt(sort: Desc)])
  @@index([targetType, targetId])
  @@map("admin_audit_log")
}
```

### 2.2 Estados de tutor

Ya tienes los estados modelados — **no hace falta crear nada nuevo**:

- `TutorApplication.status`: `Pending | Approved | Rejected` (estado del trámite)
- `users.is_tutor_approved`: bool (rol activo)
- `TutorCourse.status`: `Pending | Approved | Rejected` (per-materia)
- `users.is_active` y los nuevos `suspended_at` / `suspended_reason` (moderación)

La pieza que falta es **un campo `rejection_reason` en `TutorApplication`** para que el admin pueda dejar contexto al rechazar:

```prisma
model TutorApplication {
  // ... existente ...
  rejectionReason  String?  @map("rejection_reason")
  reviewedAt       DateTime? @map("reviewed_at")
  reviewedById     String?   @map("reviewed_by_id")
  reviewedBy       User?     @relation("ApplicationReviewedBy", fields: [reviewedById], references: [id])
}
```

### 2.3 Migración SQL (resumen)

```sql
-- 1. Nuevo enum Role
CREATE TYPE "Role" AS ENUM ('STUDENT', 'ADMIN');

-- 2. Columnas en users
ALTER TABLE users
  ADD COLUMN role "Role" NOT NULL DEFAULT 'STUDENT',
  ADD COLUMN suspended_at TIMESTAMP,
  ADD COLUMN suspended_reason TEXT,
  ADD COLUMN suspended_by_id TEXT REFERENCES users(id) ON DELETE SET NULL;

-- 3. Columnas en tutor_applications
ALTER TABLE tutor_applications
  ADD COLUMN rejection_reason TEXT,
  ADD COLUMN reviewed_at TIMESTAMP,
  ADD COLUMN reviewed_by_id TEXT REFERENCES users(id) ON DELETE SET NULL;

-- 4. Tabla de auditoría
CREATE TABLE admin_audit_log (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  admin_id    TEXT NOT NULL REFERENCES users(id),
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  payload     JSONB,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX admin_audit_admin_idx ON admin_audit_log(admin_id, created_at DESC);
CREATE INDEX admin_audit_action_idx ON admin_audit_log(action, created_at DESC);
CREATE INDEX admin_audit_target_idx ON admin_audit_log(target_type, target_id);

-- 5. Promover al primer admin (manual, desde psql/Supabase)
UPDATE users SET role = 'ADMIN' WHERE email = 'tu-email@uniandes.edu.co';
```

### 2.4 Vistas materializadas para métricas (opcional, Fase 4)

Las queries del dashboard escanean `sessions` + `payments` agrupados por semana/mes. Si la tabla crece a >100k filas, conviene una vista materializada que se refresque cada 5–15 minutos vía cron:

```sql
CREATE MATERIALIZED VIEW admin_metrics_weekly AS
SELECT
  DATE_TRUNC('week', start_timestamp) AS week_start,
  COUNT(*) FILTER (WHERE status = 'Completed')                       AS sessions_completed,
  COUNT(*) FILTER (WHERE status = 'Canceled')                        AS sessions_canceled,
  COUNT(DISTINCT tutor_id) FILTER (WHERE status = 'Completed')       AS active_tutors
FROM sessions
GROUP BY 1;

-- Refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY admin_metrics_weekly;
```

Mientras tanto (volumen bajo) las queries on-demand están bien.

---

## 3. Endpoints API

> Convención: todo bajo `/api/admin/**`, todos protegidos con `requireAdminUser`, todas las acciones de mutación escriben en `admin_audit_log`.

### 3.1 Gestión de tutores

| Método | Ruta | Propósito |
|---|---|---|
| `GET` | `/api/admin/tutors/pending` | Lista de aplicaciones con `status='Pending'` + datos del usuario + materias solicitadas. |
| `GET` | `/api/admin/tutors` | Lista todos los tutores aprobados, con filtros (`?status=active|suspended`, `?search=`). |
| `GET` | `/api/admin/tutors/[userId]` | Detalle de un tutor: aplicación, perfil, materias con su status individual, métricas (rating, sesiones). |
| `POST` | `/api/admin/tutors/[userId]/approve` | Body: `{ courseIds: string[], rejectionReason?: string }`. Aprueba al user, crea filas en `tutor_courses` solo para los `courseIds` aprobados (las demás de la aplicación quedan `Rejected`). |
| `POST` | `/api/admin/tutors/[userId]/reject` | Body: `{ reason: string }`. Marca `tutor_applications.status='Rejected'`, no toca `users.role`. |
| `POST` | `/api/admin/tutors/[userId]/suspend` | Body: `{ reason: string }`. Setea `is_active=false`, `suspended_at`, `suspended_reason`. Cancela sesiones futuras. |
| `POST` | `/api/admin/tutors/[userId]/reinstate` | Reactiva tutor suspendido. |
| `PUT` | `/api/admin/tutor-courses/[tutorId]/[courseId]` | (ya existe) Aprobar/rechazar materia individual de un tutor ya aprobado. |

### 3.2 Métricas

| Método | Ruta | Devuelve |
|---|---|---|
| `GET` | `/api/admin/metrics/overview` | Snapshot de KPIs: tutores activos, sesiones esta semana, ingresos del mes, sesiones pendientes. Una sola request para el dashboard inicial. |
| `GET` | `/api/admin/metrics/sessions?range=12w` | Series semanales: `[{ weekStart, completed, canceled, pending }]`. Para el gráfico de líneas. |
| `GET` | `/api/admin/metrics/revenue?range=12m` | Series mensuales: `[{ monthStart, gross, calicoFee, tutorPayout }]`. |
| `GET` | `/api/admin/metrics/top-courses?limit=10&range=30d` | Materias más solicitadas: `[{ courseId, name, sessions, revenue }]`. |
| `GET` | `/api/admin/metrics/active-tutors?range=30d` | `[{ tutorId, name, sessions, rating, payout }]` ordenado por sesiones. |

### 3.3 Auditoría

| Método | Ruta | Propósito |
|---|---|---|
| `GET` | `/api/admin/audit?action=&adminId=&from=&to=` | Listado paginado del log. |

### 3.4 Endpoints "yo soy admin" para el cliente

| Método | Ruta | Propósito |
|---|---|---|
| `GET` | `/api/auth/me` (existente) | Debe **incluir `role`** en la respuesta para que el frontend decida si mostrar el menú admin. |

---

## 4. Estructura de UI

### 4.1 Árbol de archivos

```
src/app/home/admin/
├── layout.jsx                    # Guard de rol + AdminShell (sidebar)
├── page.jsx                      # /home/admin → redirige a /home/admin/dashboard
│
├── dashboard/
│   └── page.jsx                  # KPIs + 3 charts + top de materias
│
├── tutors/
│   ├── page.jsx                  # Tabla de tutores (tabs: Pendientes | Activos | Suspendidos)
│   └── [userId]/
│       └── page.jsx              # Detalle: aprobar materias, suspender, ver historial
│
├── audit/
│   └── page.jsx                  # Log de acciones (tabla + filtros)
│
└── _components/
    ├── AdminShell.jsx            # Layout con sidebar + topbar
    ├── KpiCard.jsx               # Tarjeta de métrica (con delta vs periodo anterior)
    ├── SessionsChart.jsx         # Recharts línea
    ├── RevenueChart.jsx          # Recharts barras
    ├── TopCoursesTable.jsx
    ├── TutorRow.jsx              # Fila de tabla de tutores
    ├── ApproveTutorModal.jsx     # Permite seleccionar qué materias aprobar
    ├── SuspendTutorModal.jsx     # Pide reason
    └── AuditLogRow.jsx
```

### 4.2 Servicios cliente (siguen el patrón del proyecto)

```
src/app/services/core/
└── AdminService.js               # Wrapper sobre /api/admin/** usando authFetch
```

### 4.3 Servicios backend

```
src/lib/services/
├── admin.service.js              # Orquesta aprovechando user + academic + audit
├── admin-metrics.service.js      # Queries de KPIs/charts
└── admin-audit.service.js        # Inserción en audit log

src/lib/repositories/
├── admin-audit.repository.js
└── admin-metrics.repository.js   # SQL crudo o Prisma para series temporales
```

### 4.4 Librería de charts

**Recomendación: Recharts** — Liviano (~90 KB gzip), API declarativa que casa bien con React, no requiere D3 directo. Alternativa: `@tremor/react` (preconstruidos para dashboards admin, encima de Recharts).

---

## 5. Plan de ejecución por fases

### Fase 1 — Base de datos y modelo ✅ (completada 2026-05-10)

**Objetivo:** schema actualizado, primer admin existe en DB, sin tocar UI ni endpoints.

**Entregables aplicados:**

1. Migración [`20260510120000_add_role_and_admin_audit`](../prisma/migrations/20260510120000_add_role_and_admin_audit/migration.sql) creada e insertada en `_prisma_migrations` (Plan B vía SQL crudo, ya que `prisma migrate dev` falla por el historial roto de `20260509180000_add_review_course_id` — ver "Riesgos y deuda técnica").
2. Schema Prisma actualizado: enum `Role { STUDENT, ADMIN }`, columnas `role` + `suspended_at/reason/by_id` en `User`, `rejection_reason` + `reviewed_at/by_id` en `TutorApplication`, modelo `AdminAuditLog` con sus tres índices.
3. Cliente Prisma regenerado (`npx prisma generate`).
4. [`SecureAuthContext`](../src/app/context/SecureAuthContext.js) ahora expone tres campos nuevos: `roleDb` (enum DB), `isAdmin` (boolean conveniente) y mantiene `role` legacy ('Student'/'Tutor') intacto para no romper [`useUser.js`](../src/app/hooks/useUser.js) ni [`PaymentHistory.jsx`](../src/app/components/PaymentHistory/PaymentHistory.jsx). `/api/auth/me` ya devuelve `role` automáticamente vía `findById`.
5. Primer admin promovido con `UPDATE users SET role = 'ADMIN' WHERE email = ...`.

**Decisión de implementación clave:** el campo de UI `user.role` se reservó para el rol de vista (Student/Tutor) que ya consume el código. El rol de DB se expone como `user.roleDb` y el helper `user.isAdmin` para los chequeos de permiso. Todos los guards de Fase 2 deben usar `isAdmin` o `roleDb === 'ADMIN'`, **no** `role === 'ADMIN'`.

**Verificación realizada:** `useAuth().user.isAdmin === true` para la cuenta promovida.

### Fase 2 — Backend RBAC + endpoints de tutores ✅ (completada 2026-05-10)

**Objetivo:** la API admin funciona end-to-end con curl/Postman antes de tocar UI.

**Entregables aplicados:**

1. **Guards de seguridad** ([src/lib/auth/guards.js](../src/lib/auth/guards.js)):
   - `requireAdminSecret` (renombrado de `requireAdmin`) — para cron/scripts. `requireAdmin` se mantiene como alias `@deprecated` para no romper las 5 rutas legacy ni los tests existentes.
   - `requireAdminUser(request)` — para humanos: valida JWT y luego consulta `users.role` desde DB en cada request (rol nunca confiado del token). Bloquea también si `is_active=false`.
2. **Audit log:**
   - [src/lib/repositories/admin-audit.repository.js](../src/lib/repositories/admin-audit.repository.js) — `create` + `findMany` paginado.
   - [src/lib/services/admin-audit.service.js](../src/lib/services/admin-audit.service.js) — `logAction()` con extracción de IP/UA desde headers de proxy y constantes `ADMIN_ACTIONS`. Falla silenciosamente si no puede escribir el log (no debe bloquear la acción admin legítima).
3. **Servicio orquestador** [src/lib/services/admin.service.js](../src/lib/services/admin.service.js):
   - `listPendingApplications` — con resolución de IDs de materias a nombres en una sola query.
   - `approveTutor` — transacción que actualiza `users` + cierra `tutor_applications` + hace `upsert` en `tutor_courses` (Approved/Rejected) + dispara el trigger que crea `tutor_profiles`. Defensivo: ignora courseIds que no estén en la solicitud original.
   - `rejectTutor` — exige razón, no toca `is_tutor_approved`.
   - `suspendTutor` / `reinstateTutor` — toggle de `is_active` + campos de suspensión. La cancelación de sesiones futuras se difirió (ver "Riesgos").
4. **5 Endpoints nuevos** bajo `/api/admin/tutors/**`:
   - `GET /pending` ([route.js](../src/app/api/admin/tutors/pending/route.js))
   - `POST /[userId]/approve` ([route.js](../src/app/api/admin/tutors/[userId]/approve/route.js))
   - `POST /[userId]/reject` ([route.js](../src/app/api/admin/tutors/[userId]/reject/route.js))
   - `POST /[userId]/suspend` ([route.js](../src/app/api/admin/tutors/[userId]/suspend/route.js))
   - `POST /[userId]/reinstate` ([route.js](../src/app/api/admin/tutors/[userId]/reinstate/route.js))
   - Todos validan body con Zod y mapean los `code` del service a HTTP status (404/400/422/500).

**Decisiones tomadas durante la ejecución:**

- **`src/middleware.js` diferido a Fase 5.** El JWT del proyecto se firma con `jsonwebtoken` (CommonJS, runtime Node). El middleware de Next.js corre en Edge runtime por defecto y `jsonwebtoken` no es compatible — habría que migrar a `jose` o forzar el middleware a runtime Node. Defensa real ya queda cubierta por `requireAdminUser` en cada endpoint (capa 4 = barrera real). Layout cliente (capa 2) llega en Fase 3.
- **Wrapper `withAuditLog` no creado.** Cada service llama a `auditService.logAction()` directamente. Más explícito, fácil de auditar y sin magia. Si después se vuelve repetitivo, se factoriza.
- **Tests diferidos.** El trabajo de cubrir 5 endpoints + 4 acciones de servicio con mocks adecuados (Prisma, audit, transacciones) es comparable en tamaño a la Fase 2 misma. Recomendado abordarlos en bloque al cierre de Fase 3, cuando el contrato de los endpoints esté validado por la UI.

**Cómo verificar (curl/Postman):**

```bash
# 1. Obtén tu JWT (login normal en la UI, sácalo del localStorage `calico_auth_token`).
TOKEN="eyJhbGciOi..."

# 2. Lista solicitudes pendientes
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/tutors/pending

# 3. Aprueba con un subset de materias (las que NO estén en courseIds quedan Rejected)
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"courseIds":["uuid-1","uuid-2"]}' \
  http://localhost:3000/api/admin/tutors/<userId>/approve

# 4. Verifica en SQL
SELECT tutor_id, course_id, status FROM tutor_courses WHERE tutor_id = '<userId>';
SELECT * FROM admin_audit_log WHERE admin_id = '<tu-id>' ORDER BY created_at DESC LIMIT 5;
```

Una cuenta NO-admin con su JWT debe recibir `403 FORBIDDEN` en cualquiera de estas rutas.

### Fase 3 — UI: shell, lista y detalle de tutores ✅ (completada 2026-05-10)

**Objetivo:** un admin puede aprobar/rechazar/suspender tutores desde el navegador.

**Entregables aplicados:**

- **2 endpoints adicionales** que faltaban en Phase 2 ([`GET /api/admin/tutors`](../src/app/api/admin/tutors/route.js) y [`GET /api/admin/tutors/[userId]`](../src/app/api/admin/tutors/[userId]/route.js)) más sus métodos en [`admin.service.js`](../src/lib/services/admin.service.js): `listApprovedTutors({ status, search, ... })` y `getTutorDetail(userId)`.
- [`AdminService`](../src/app/services/core/AdminService.js) cliente que envuelve los 7 endpoints admin.
- **Link admin en el [Header](../src/app/components/Header/Header.jsx)** con icono `Shield`, condicional a `user.isAdmin`. Apunta a `/home/admin/tutors`. Sólo UX — la barrera real está en el backend.
- [`/home/admin/layout.jsx`](../src/app/home/admin/layout.jsx) con guard cliente: redirige a `/auth/login` si no hay sesión, a `/home` si no es admin. Mientras `loading`, muestra spinner sin parpadeo.
- [`AdminShell`](../src/app/home/admin/_components/AdminShell.jsx) con sidebar (Tutores activo, Dashboard y Auditoría marcados como "pronto" hasta Fases 4–5).
- [`/home/admin/tutors/page.jsx`](../src/app/home/admin/tutors/page.jsx): tabs **Pendientes / Activos / Suspendidos**, búsqueda con debounce 300ms (sólo en tabs de aprobados), filas distintas para `PendingRow` (con materias chips) vs `TutorRow` (con rating, sesiones y motivo de suspensión truncado).
- [`/home/admin/tutors/[userId]/page.jsx`](../src/app/home/admin/tutors/[userId]/page.jsx): vista de detalle con header del usuario (email, teléfono, carrera, llave), badges de estado, sección de aplicación con **checkboxes para escoger materias a aprobar** (resto queda Rejected automáticamente), grid de tutor_courses con su status, y panel de moderación para Suspender / Reactivar. Componente `ActionModal` reutilizable con `requireReason` opcional.

**Decisiones tomadas durante la ejecución:**

- **Pre-selección de todas las materias al abrir el detalle.** Default: "el admin aprueba todo". Que destilde manualmente las que NO. Más rápido para el caso común que ir tildando una a una.
- **No se construyó tabla de `audit/page.jsx` ni `dashboard/page.jsx`.** Aparecen en el sidebar marcados como "pronto" para que la navegación se sienta completa, pero el contenido se difiere a sus fases respectivas (4 y 5).
- **`Suspendidos` y `Activos` comparten endpoint** (`/api/admin/tutors?status=...`). Más simple y consistente que dos endpoints separados.
- **Migración de los endpoints legacy NO se hizo.** `/api/admin/tutors/[userId]` PUT (con `x-admin-secret`) y `/api/admin/tutor-courses/**` siguen ahí intactos; el panel admin ignora ambos y usa los nuevos POST `/approve|reject|suspend|reinstate`. Deprecación formal va en Fase 5.

**Cómo verificar manualmente:**

1. Como admin (`user.isAdmin === true`) ves un icono escudo en el header → click te lleva a `/home/admin/tutors`.
2. Como student abriendo `localhost:3000/home/admin` directo → redirección silenciosa a `/home`.
3. Tab "Pendientes" lista solicitudes; click en una → detalle con checkboxes; aprobar 1 de N materias → en SQL `tutor_courses` queda 1 Approved + (N-1) Rejected y el badge superior cambia a "Tutor activo".
4. Tab "Activos" o "Suspendidos" → buscar por nombre/email funciona con debounce.
5. Suspender un tutor → desaparece de "Activos", aparece en "Suspendidos" con razón visible. Reactivar lo regresa.
6. Cada acción deja una fila en `admin_audit_log` con tu admin_id e IP.

### Fase 4 — Dashboard y métricas ✅ (completada 2026-05-10)

**Objetivo:** los gráficos cargan, son precisos, y el admin puede ver tendencias.

**Entregables aplicados:**

- **Repositorio** [`admin-metrics.repository.js`](../src/lib/repositories/admin-metrics.repository.js): 6 funciones (`sessionsThisWeek`, `revenueThisMonth`, `activeTutorsCount`, `pendingApplicationsCount`, `sessionsByWeek`, `revenueByMonth`, `topCourses`, `topTutors`) con `prisma.$queryRaw` y `DATE_TRUNC`. Coerce decimales a número antes de devolver.
- **Servicio** [`admin-metrics.service.js`](../src/lib/services/admin-metrics.service.js): caché in-process Map+TTL 5 min, helper `memo(key, loader)`, función `invalidateAllMetrics()`. Caps defensivos en `weeks/months/days/limit` (max 52 / 36 / 365 / 50).
- **Invalidación de caché** desde [`admin.service.js`](../src/lib/services/admin.service.js): `invalidateAllMetrics()` se llama tras approve/reject/suspend/reinstate para que el KPI de "Solicitudes pendientes" refleje cambios al instante.
- **5 endpoints** bajo `/api/admin/metrics/`:
  - [`/overview`](../src/app/api/admin/metrics/overview/route.js) — snapshot de los 4 KPIs en una sola llamada.
  - [`/sessions?weeks=N`](../src/app/api/admin/metrics/sessions/route.js) — serie semanal de sesiones (Completed/Canceled/Upcoming).
  - [`/revenue?months=N`](../src/app/api/admin/metrics/revenue/route.js) — serie mensual de ingresos brutos.
  - [`/top-courses?days=N&limit=K`](../src/app/api/admin/metrics/top-courses/route.js) — top materias.
  - [`/active-tutors?days=N&limit=K`](../src/app/api/admin/metrics/active-tutors/route.js) — top tutores con rating.
- **Dependencia agregada**: `recharts@3.8.1`.
- **Componentes** en [`_components/`](../src/app/home/admin/_components):
  - `KpiCard` con 4 tonos (orange/emerald/blue/amber), skeleton de carga.
  - `SessionsChart` — línea triple con tooltip formateado.
  - `RevenueChart` — barras con formato COP en eje Y y tooltip.
  - `TopCoursesTable` y `TopTutorsTable` con filas numeradas y links al detalle.
- **Página** [`/home/admin/dashboard/page.jsx`](../src/app/home/admin/dashboard/page.jsx): KPIs + 2 charts + 2 rankings, selector de rango (7d/30d/90d) que afecta a las dos tablas inferiores, botón "Refrescar" (pasa por `Promise.all` para que el peor caso = max latencia, no la suma), manejo de error consolidado.
- **Sidebar de [`AdminShell`](../src/app/home/admin/_components/AdminShell.jsx)**: Dashboard pasa de "pronto" a item activo y queda en primera posición.
- **Header [`Header.jsx`](../src/app/components/Header/Header.jsx)**: link admin ahora apunta a `/home/admin` (no a `/tutors`), que redirige al dashboard.

**Decisiones tomadas durante la ejecución:**

- **Revenue es solo "gross", sin desglose Calico-fee/tutor-payout.** El esquema actual de `payments` no separa la comisión de Calico del pago al tutor de forma consistente — algunos pagos almacenan el monto bruto, otros el neto. Hasta que se canonice la fee model (parte de `wompi.service.js`), mostrar "ingresos brutos" es honesto; cualquier descomposición sería ficción.
- **Selector de rango sólo afecta rankings, no charts.** Las series semanales/mensuales tienen sentido en ventanas grandes fijas (12 semanas, 12 meses). Variar esos rangos sin guardarrieles complicaba el UX para una mejora marginal — los rankings sí cambian con frecuencia y ahí 7d/30d/90d es útil.
- **Caché in-process, no Redis.** Es trivial y funciona bien en single-instance. Si en el futuro corre en multi-instance con balanceo, cambiar `memo()` por un cliente Redis es localizado en `admin-metrics.service.js`.
- **No se separó la lectura por días reales (ej. 7d para sesiones).** Si el rango es 7d y el chart sigue mostrando 12 semanas, evita inconsistencias visuales — ya hay un sub-text que aclara el período fijo.

**Cómo verificar (margen 0 esperado):**

1. Compara con SQL — los KPIs deben cuadrar exactamente:
   ```sql
   SELECT COUNT(*) FROM sessions
   WHERE status='Completed' AND start_timestamp >= DATE_TRUNC('week', NOW());
   -- debe igualar al KPI "Sesiones esta semana"

   SELECT COUNT(*) FROM tutor_applications WHERE status='Pending';
   -- debe igualar al KPI "Solicitudes pendientes"
   ```
2. Aprueba/rechaza una solicitud desde `/home/admin/tutors` → en el dashboard el KPI de "Solicitudes pendientes" cambia inmediatamente (caché invalidada).
3. Botón "Refrescar" fuerza la recarga de los 5 endpoints en paralelo. Sin él, la caché TTL 5 min mantiene los datos hasta que expire.

### Fase 5 — Auditoría, polish, hardening ✅ (completada 2026-05-10)

**Entregables aplicados:**

1. **UI de auditoría** ([src/app/home/admin/audit/page.jsx](../src/app/home/admin/audit/page.jsx)):
   - Tabla paginada (25/página) con columnas: fecha, admin, acción (con tono según tipo), target, payload (preview compacto + JSON completo en hover/title), IP.
   - Filtros: acción (dropdown con las 6 acciones registradas), rango de fecha (`from`/`to`).
   - Endpoint backend [`GET /api/admin/audit`](../src/app/api/admin/audit/route.js) con los mismos filtros + `targetType`/`targetId`/`adminId` para casos avanzados.
   - Sidebar de [`AdminShell`](../src/app/home/admin/_components/AdminShell.jsx) ya tiene "Auditoría" activo (no más placeholder).

2. **Suspensión cancela sesiones futuras del tutor** ([admin.service.js](../src/lib/services/admin.service.js)):
   - `suspendTutor` ahora hace un `updateMany` sobre `sessions` con `tutorId=userId AND status IN ('Pending','Accepted') AND start_timestamp > now()` → marca `Canceled` con `cancellationReason='TUTOR_SUSPENDED'` y `cancelledBy=adminId`.
   - El conteo de canceladas se incluye en el audit log (`payload.cancelledSessionsCount`) y se muestra en el flash del UI: *"Tutor suspendido. 3 sesión(es) futura(s) canceladas."*
   - **Lo que NO hace** (deuda restante): cleanup de Google Calendar, refund automático vía Wompi, email a estudiantes afectados. Documentado abajo.

3. **Emails al tutor en transiciones de estado** ([email.service.js](../src/lib/services/email.service.js)):
   - 3 templates nuevos: `TUTOR_APPLICATION_APPROVED` (id 11), `TUTOR_APPLICATION_REJECTED` (id 12), `TUTOR_SUSPENDED` (id 13). **El equipo debe crearlos en Brevo dashboard** con los params documentados antes de que estos correos se envíen correctamente.
   - Disparados fire-and-forget desde `admin.service` (un fallo de Brevo nunca bloquea la acción admin).
   - Los IDs y params están listados en [email.service.js:16-29](../src/lib/services/email.service.js).

4. **Rate limiting** ([src/lib/auth/rateLimit.js](../src/lib/auth/rateLimit.js)):
   - Token bucket in-memory por proceso, key `admin:${userId}`.
   - 30 requests/minuto por admin user. 429 con `Retry-After` cuando se excede.
   - Integrado dentro de `requireAdminUser` → cada endpoint admin lo hereda gratis.
   - Cleanup periódico cada 60s para que el `Map` no crezca sin límite.

5. **Revisión de seguridad final** — checklist abajo, todos los puntos pasan.

**Decisiones tomadas durante la ejecución:**

- **Cancelación de sesiones es bulk update directo, no llamada a `session.service.cancelSession()`.** El service exige `userId === tutorId` (el tutor cancela sus propias sesiones). Crear un "modo admin" allí ensucia el contrato. Más limpio: bulk update + `cancellationReason='TUTOR_SUSPENDED'` que el equipo de soporte puede usar para correr scripts manuales de refund/calendar luego.
- **Rate limit dentro de `requireAdminUser`, no como middleware separado.** Funciona en runtime Node sin tocar el problema Edge. Una sola clave por admin (no por endpoint específico) — simple y suficiente para detener floods.
- **Templates de Brevo 11/12/13 no creados todavía** (no podemos hacerlo desde código). Si alguien aprueba/rechaza/suspende antes de crear los templates, los `sendBrevoEmail` van a fallar en silencio (catch). El audit log igual queda.

**Revisión de seguridad final:**

- [x] Usuario deslogueado abre `localhost:3000/home/admin` → redirección a `/auth/login`. (Layout cliente lo intercepta con `loading || !user.isLoggedIn`.)
- [x] Usuario student logueado abre `/home/admin` → redirección a `/home`.
- [x] Llamar `curl -H "Authorization: Bearer <jwt-student>" /api/admin/tutors` → 403 `FORBIDDEN`.
- [x] Llamar `curl /api/admin/tutors` (sin token) → 401.
- [x] Llamar 31 veces seguidas con JWT admin → la 31ª devuelve 429 con `Retry-After`.
- [x] Aprobar 2 de N materias → SQL `SELECT ... FROM tutor_courses` muestra exactamente esas Approved y el resto Rejected.
- [x] Suspender tutor con sesiones futuras → quedan `Canceled` con `cancellation_reason='TUTOR_SUSPENDED'`; el conteo coincide con UI.
- [x] Cada acción en UI deja una fila en `admin_audit_log` con admin_id, IP, payload.
- [x] Promover en SQL `role='ADMIN'` toma efecto al instante (no requiere re-login) — `requireAdminUser` consulta DB cada request.
- [x] Demote (`role='STUDENT'`) → la siguiente request del ex-admin recibe 403.

**Cómo verificar en navegador:**

1. Sidebar → click en "Auditoría". Filtra por "Aprobación de tutor". Las entradas que generaste antes deben aparecer con tu nombre y la IP local.
2. En cualquier endpoint admin, abre DevTools → Network → repite la acción 31 veces rápido. La 31ª debe ser 429.
3. Aprueba a un tutor con email real → revisa en Brevo dashboard → "Logs" si el email salió (después de crear el template 11). Si template no existe, verás un error en la consola del servidor pero el aprobado se guarda igual.

---

## 6. Riesgos y deuda técnica conocida

- **Historial de migraciones roto en local.** `prisma migrate dev` falla porque la migración `20260509180000_add_review_course_id` referencia `reviews.tutor_id`, pero la columna no existe en la shadow DB que Prisma reconstruye desde cero (la refactorización de `reviews` se aplicó en algún momento sin generar archivo de migración). En Fase 1 se aplicaron los cambios con SQL crudo + `INSERT INTO _prisma_migrations`. **Pendiente:** escribir una migración de reconciliación que lleve `reviews` del schema viejo (`reviewer_id`, `stars`, `reviewer_email`) al actual (`student_id`, `tutor_id`, `rating`, `course_id`). Sin eso, ningún miembro nuevo puede levantar la DB desde cero.
- ~~**Suspender un tutor no cancela sesiones futuras.**~~ ✅ Resuelto en Fase 5: bulk update de `sessions` a `Canceled` con `cancellation_reason='TUTOR_SUSPENDED'`. Pendiente todavía: cleanup de eventos en Google Calendar, flujo de refund automático vía Wompi, email a estudiantes afectados — todos fuera de scope para no acoplar `admin.service` a `wompi.service` y `calicoCalendar`. El equipo soporte puede hacer estos como tareas manuales: filtrar `WHERE cancellation_reason = 'TUTOR_SUSPENDED'` y procesar.
- **Tests de admin diferidos.** Los 12 endpoints (`/api/admin/**`) y los services orquestadores no tienen cobertura automatizada. Riesgo bajo porque los services son puros y los handlers son finos, pero deuda real para evolución futura. Recomendación: bloque dedicado de 1–2 días con mocks de Prisma/audit/email.
- **Middleware Edge no implementado.** Por la incompatibilidad de `jsonwebtoken` con Edge runtime, no hay un bouncer único en `src/middleware.js`. La defensa real (`requireAdminUser` en cada endpoint) está intacta y todos los endpoints admin lo importan; un futuro endpoint que olvide hacerlo no quedaría protegido por una capa superior. Mitigación operativa: convención + revisión de PRs + el rate limiter del guard sirve también como canario. Resolución definitiva: migrar `lib/auth/jwt.js` de `jsonwebtoken` a `jose`. Ticket separado.
- **Templates Brevo 11/12/13 (TUTOR_APPLICATION_APPROVED/REJECTED, TUTOR_SUSPENDED) no creados en el dashboard.** El código los referencia pero el equipo debe crearlos en Brevo antes de que los emails efectivamente se envíen. Mientras tanto los sends fallan silenciosamente (catch fire-and-forget) sin afectar la acción admin.
- **2FA para admins.** No implementado. Riesgo aceptable mientras haya pocos admins humanos; abordar cuando el equipo crezca o cuando aparezca un admin de soporte tercerizado.
- **`isTutorRequested` no se setea en `submitApplication`.** El service `approveTutor` actual exige `isTutorRequested=true` y rompe el flujo. La Fase 2 corrige esto al construir un nuevo `approveTutor` desde el panel; el endpoint legacy `/api/admin/tutors/[userId]` (PUT con `x-admin-secret`) puede deprecarse.
- **`approveTutor` no toca `tutor_applications.status` ni crea `tutor_courses`.** Mismo issue. Fase 2 lo resuelve en el nuevo endpoint.
- **El JWT actual no incluye `role`.** Decidir: (a) firmarlo en el token al login (rápido, pero stale al cambiar rol) o (b) leer rol de DB en cada request (recomendado). Plan sigue (b).
- **Las métricas de revenue dependen de `payments.status='paid'`.** Validar que el flujo Wompi efectivamente marca como `paid` y no como `pending`. Si no, el dashboard reportará menos de lo real.
- **No hay límite de aplicaciones por user.** Si un rechazado reaplica 50 veces, la lista de "Pendientes" se inunda. Considerar un cooldown (`reapply_after`) en Fase 5.

---

## 7. Anexo: queries SQL listas para los KPIs

Queries de referencia que el `admin-metrics.repository.js` debe encapsular (todas filtran por `payments.status='paid'` o `sessions.status='Completed'` según corresponda).

```sql
-- KPI 1: Tutorías esta semana (lunes a hoy)
SELECT COUNT(*) AS sessions_this_week
FROM sessions
WHERE status = 'Completed'
  AND start_timestamp >= DATE_TRUNC('week', NOW());

-- KPI 2: Ingresos del mes (en COP, antes de comisión)
SELECT COALESCE(SUM(amount), 0) AS revenue_this_month
FROM payments
WHERE status = 'paid'
  AND created_at >= DATE_TRUNC('month', NOW());

-- KPI 3: Tutores activos (con al menos 1 sesión completada en últimos 30 días)
SELECT COUNT(DISTINCT tutor_id) AS active_tutors_30d
FROM sessions
WHERE status = 'Completed'
  AND start_timestamp >= NOW() - INTERVAL '30 days';

-- KPI 4: Top materias últimos 30 días
SELECT c.id, c.name, c.code, COUNT(s.id) AS sessions
FROM sessions s
JOIN courses c ON c.id = s.course_id
WHERE s.status = 'Completed'
  AND s.start_timestamp >= NOW() - INTERVAL '30 days'
GROUP BY c.id
ORDER BY sessions DESC
LIMIT 10;

-- Serie semanal (para gráfica de líneas, últimas 12 semanas)
SELECT
  DATE_TRUNC('week', start_timestamp) AS week_start,
  COUNT(*) FILTER (WHERE status = 'Completed') AS completed,
  COUNT(*) FILTER (WHERE status = 'Canceled')  AS canceled
FROM sessions
WHERE start_timestamp >= NOW() - INTERVAL '12 weeks'
GROUP BY 1
ORDER BY 1;

-- Serie mensual de ingresos (12 meses)
SELECT
  DATE_TRUNC('month', created_at) AS month_start,
  SUM(amount) AS gross
FROM payments
WHERE status = 'paid'
  AND created_at >= NOW() - INTERVAL '12 months'
GROUP BY 1
ORDER BY 1;
```

---

## 8. Estimación total

| Fase | Días | Acumulado |
|---|---|---|
| 1. DB + modelo | 1–2 | 2 |
| 2. Backend RBAC + tutores | 3–5 | 7 |
| 3. UI tutores | 3–4 | 11 |
| 4. Dashboard métricas | 3–4 | 15 |
| 5. Auditoría + polish | 2–3 | 18 |

**Total: ~3 semanas** para una persona dedicada full-time. Si haces Fase 1 + 2 primero y luego pausas, ya queda funcional desde Postman/curl.

---

## 9. Definition of Done

El panel está listo cuando:

- [ ] Un usuario no-admin pegando `/home/admin` en el navegador es redirigido en <500ms.
- [ ] Un usuario no-admin haciendo `curl -H "Authorization: Bearer <jwt-student>" /api/admin/tutors` recibe 403.
- [ ] Aprobar 2 de 3 materias de un tutor → la 3ª no aparece en la búsqueda por materia del lado estudiante.
- [ ] Suspender un tutor → no aparece en búsquedas, las sesiones futuras quedan canceladas, recibe email.
- [ ] Cualquier acción admin queda registrada en `admin_audit_log` con admin_id, payload y timestamp.
- [ ] Los KPIs cuadran con SQL ejecutado a mano (margen 0).
- [ ] Lighthouse score >85 en `/home/admin/dashboard` (no es público pero igual cuenta).
