# Plan de Migración: Firebase → PostgreSQL + JWT Propio

> **Objetivo**: Eliminar toda dependencia de Firebase (Auth + Admin SDK) y migrar a un sistema de autenticación JWT propio, replicando la arquitectura de `finidian-api` (sin MFA — innecesario para una app de tutorías MVP).

---

## Decisiones de Arquitectura

1. **Sin MFA**: Finidian es fintech y requiere MFA. Calico es tutorías universitarias — flujo clásico JWT + bcrypt es suficiente para el MVP.
2. **UUIDs en todas las PKs**: Prevenir ataques de enumeración en la API. Prisma `@default(uuid())`.
3. **AWS S3 con Presigned URLs**: Reemplaza Firebase Storage para fotos de perfil y documentos de tutores. En BBDD solo se guarda `profile_picture_url`.
4. **Google Calendar se mantiene**: Es regla de negocio vital para sincronizar tutorías con clases reales de la universidad.

---

## Nueva Base de Datos (PostgreSQL)

```sql
CREATE SCHEMA IF NOT EXISTS public;
SET search_path TO public;

-- ENUMS
CREATE TYPE major_enum AS ENUM ('ISIS', 'MATE', 'FISI', 'ADMI', 'ICIV', 'IMEC');
CREATE TYPE complexity_enum AS ENUM ('Introductory', 'Foundational', 'Challenging');
CREATE TYPE session_type_enum AS ENUM ('Individual', 'Group');
CREATE TYPE session_status_enum AS ENUM ('Pending', 'Accepted', 'Rejected', 'Completed', 'Canceled');
CREATE TYPE location_type_enum AS ENUM ('Virtual', 'Custom');

-- USUARIOS (PKs UUID, no INT)
CREATE TABLE users (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    bio TEXT,
    phone_number VARCHAR(20),
    profile_picture_url TEXT,  -- URL de S3 (Presigned o público)
    major major_enum,
    is_tutor_requested BOOLEAN DEFAULT FALSE,
    is_tutor_approved BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    is_email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PERFIL TUTOR
CREATE TABLE tutor_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    school_email VARCHAR(150) UNIQUE NOT NULL,
    experience_years INT DEFAULT 0,
    credits INT DEFAULT 0,
    experience_description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- CURSOS Y TEMAS
CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    complexity complexity_enum NOT NULL,
    base_price NUMERIC(10, 2) NOT NULL
);

CREATE TABLE topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE tutor_courses (
    tutor_id UUID REFERENCES tutor_profiles(user_id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    custom_price NUMERIC(10, 2) NOT NULL,
    PRIMARY KEY (tutor_id, course_id)
);

-- DISPONIBILIDAD
CREATE TABLE schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    timezone VARCHAR(50) DEFAULT 'America/Bogota',
    auto_accept_session BOOLEAN DEFAULT FALSE,
    min_booking_notice INT DEFAULT 24,
    max_sessions_per_day INT DEFAULT 5,
    buffer_time INT DEFAULT 15
);

CREATE TABLE availabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    CONSTRAINT valid_time_range CHECK (start_time < end_time)
);

-- SESIONES
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) ON DELETE RESTRICT,
    tutor_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    session_type session_type_enum NOT NULL,
    max_capacity INT DEFAULT 1,
    start_timestamp TIMESTAMP NOT NULL,
    end_timestamp TIMESTAMP NOT NULL,
    status session_status_enum DEFAULT 'Pending',
    location_type location_type_enum NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_session_time CHECK (start_timestamp < end_timestamp)
);

CREATE TABLE session_participants (
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    student_id UUID REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id, student_id)
);

-- RESEÑAS
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    reviewer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    reviewee_id UUID REFERENCES users(id) ON DELETE CASCADE,
    score INT NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_review_per_session UNIQUE (session_id, reviewer_id, reviewee_id)
);
```

---

## Paso 0: Variables de Entorno

```env
# === ELIMINAR ===
# NEXT_PUBLIC_FIREBASE_API_KEY
# NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
# NEXT_PUBLIC_FIREBASE_PROJECT_ID (y todas las NEXT_PUBLIC_FIREBASE_*)
# FIREBASE_PROJECT_ID
# GOOGLE_SERVICE_ACCOUNT_KEY (el JSON de Firebase Admin — solo el de Auth, NO el de Calendar)

# === MANTENER ===
DB_HOST=localhost
DB_PORT=5432
DB_NAME=calico
DB_USER=postgres
DB_PASSWORD=<tu_password>
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}

BREVO_API_KEY=<mantener_actual>
BREVO_SENDER_EMAIL=<mantener_actual>
BREVO_SENDER_NAME=<mantener_actual>

# Google Calendar (SE MANTIENE — regla de negocio vital)
GOOGLE_CLIENT_ID=<mantener>
GOOGLE_CLIENT_SECRET=<mantener>
GOOGLE_REDIRECT_URI=<mantener>
GOOGLE_SERVICE_ACCOUNT_EMAIL=<mantener>
GOOGLE_ADMIN_REFRESH_TOKEN=<mantener>
CALICO_CALENDAR_ID=<mantener>

# === AGREGAR ===
JWT_SECRET=<generar_secreto_64+_chars>        # Equivalente a JWT_SECRET_MANAGMENT de finidian
JWT_EXPIRATION=7d                              # 7 días como finidian
NEXT_PUBLIC_APP_URL=http://localhost:3000       # Para links en emails

# AWS S3 (reemplaza Firebase Storage)
AWS_ACCESS_KEY_ID=<tu_key>
AWS_SECRET_ACCESS_KEY=<tu_secret>
AWS_REGION=us-east-1
AWS_S3_BUCKET=calico-uploads
```

---

## Paso 1: Setup Inicial de Prisma con Nuevo Schema

### 1.1 Actualizar dependencias

```bash
# Eliminar Firebase
npm uninstall firebase firebase-admin

# Agregar dependencias de auth (replicando finidian-api)
npm install bcrypt jsonwebtoken
npm install -D @types/bcrypt @types/jsonwebtoken

# AWS S3 para archivos
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### 1.2 Reescribir `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum MajorEnum {
  ISIS
  MATE
  FISI
  ADMI
  ICIV
  IMEC
}

enum ComplexityEnum {
  Introductory
  Foundational
  Challenging
}

enum SessionTypeEnum {
  Individual
  Group
}

enum SessionStatusEnum {
  Pending
  Accepted
  Rejected
  Completed
  Canceled
}

enum LocationTypeEnum {
  Virtual
  Custom
}

model User {
  id               String   @id @default(uuid())
  email            String   @unique
  passwordHash     String   @map("password_hash")
  name             String
  bio              String?
  phoneNumber      String?  @map("phone_number")
  profilePictureUrl String? @map("profile_picture_url")
  major            MajorEnum?

  // Roles y estado
  isTutorRequested  Boolean  @default(false) @map("is_tutor_requested")
  isTutorApproved   Boolean  @default(false) @map("is_tutor_approved")
  isActive          Boolean  @default(true)  @map("is_active")
  isEmailVerified   Boolean  @default(false) @map("is_email_verified")

  // Tokens de verificación y reset
  verificationToken  String?   @map("verification_token")
  resetToken         String?   @map("reset_token")
  resetTokenExpiry   DateTime? @map("reset_token_expiry")
  otpCode            String?   @map("otp_code")
  otpCodeExpiry      DateTime? @map("otp_code_expiry")

  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt     @map("updated_at")

  // Relaciones
  tutorProfile        TutorProfile?
  schedule            Schedule?
  availabilities      Availability[]
  tutorSessions       Session[]             @relation("TutorSessions")
  participations      SessionParticipant[]
  reviewsWritten      Review[]              @relation("ReviewsWritten")
  reviewsReceived     Review[]              @relation("ReviewsReceived")

  @@map("users")
}

model TutorProfile {
  userId                String  @id @map("user_id")
  schoolEmail           String  @unique @map("school_email")
  experienceYears       Int     @default(0) @map("experience_years")
  credits               Int     @default(0)
  experienceDescription String? @map("experience_description")
  updatedAt             DateTime @updatedAt @map("updated_at")

  user          User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  tutorCourses  TutorCourse[]

  @@map("tutor_profiles")
}

model Course {
  id         String          @id @default(uuid())
  code       String          @unique
  name       String
  complexity ComplexityEnum
  basePrice  Decimal         @map("base_price") @db.Decimal(10, 2)

  topics       Topic[]
  tutorCourses TutorCourse[]
  sessions     Session[]

  @@map("courses")
}

model Topic {
  id          String  @id @default(uuid())
  courseId     String  @map("course_id")
  name        String
  description String?

  course Course @relation(fields: [courseId], references: [id], onDelete: Cascade)

  @@map("topics")
}

model TutorCourse {
  tutorId     String  @map("tutor_id")
  courseId     String  @map("course_id")
  customPrice Decimal @map("custom_price") @db.Decimal(10, 2)

  tutor  TutorProfile @relation(fields: [tutorId], references: [userId], onDelete: Cascade)
  course Course       @relation(fields: [courseId], references: [id], onDelete: Cascade)

  @@id([tutorId, courseId])
  @@map("tutor_courses")
}

model Schedule {
  id                String  @id @default(uuid())
  userId            String  @unique @map("user_id")
  timezone          String  @default("America/Bogota")
  autoAcceptSession Boolean @default(false) @map("auto_accept_session")
  minBookingNotice  Int     @default(24)    @map("min_booking_notice")
  maxSessionsPerDay Int     @default(5)     @map("max_sessions_per_day")
  bufferTime        Int     @default(15)    @map("buffer_time")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("schedules")
}

model Availability {
  id        String @id @default(uuid())
  userId    String @map("user_id")
  dayOfWeek Int    @map("day_of_week")
  startTime DateTime @map("start_time") @db.Time()
  endTime   DateTime @map("end_time")   @db.Time()

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("availabilities")
}

model Session {
  id             String            @id @default(uuid())
  courseId        String            @map("course_id")
  tutorId         String            @map("tutor_id")
  sessionType    SessionTypeEnum   @map("session_type")
  maxCapacity    Int               @default(1) @map("max_capacity")
  startTimestamp DateTime          @map("start_timestamp")
  endTimestamp   DateTime          @map("end_timestamp")
  status         SessionStatusEnum @default(Pending)
  locationType   LocationTypeEnum  @map("location_type")
  notes          String?
  createdAt      DateTime          @default(now()) @map("created_at")

  course       Course               @relation(fields: [courseId], references: [id], onDelete: Restrict)
  tutor        User                 @relation("TutorSessions", fields: [tutorId], references: [id], onDelete: Restrict)
  participants SessionParticipant[]
  reviews      Review[]

  @@map("sessions")
}

model SessionParticipant {
  sessionId String   @map("session_id")
  studentId String   @map("student_id")
  joinedAt  DateTime @default(now()) @map("joined_at")

  session Session @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  student User    @relation(fields: [studentId], references: [id], onDelete: Cascade)

  @@id([sessionId, studentId])
  @@map("session_participants")
}

model Review {
  id         String   @id @default(uuid())
  sessionId  String   @map("session_id")
  reviewerId String   @map("reviewer_id")
  revieweeId String   @map("reviewee_id")
  score      Int
  comment    String?
  createdAt  DateTime @default(now()) @map("created_at")

  session  Session @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  reviewer User    @relation("ReviewsWritten", fields: [reviewerId], references: [id], onDelete: Cascade)
  reviewee User    @relation("ReviewsReceived", fields: [revieweeId], references: [id], onDelete: Cascade)

  @@unique([sessionId, reviewerId, revieweeId])
  @@map("reviews")
}
```

### 1.3 Generar cliente y migrar

```bash
npx prisma migrate dev --name init_new_schema
npx prisma generate
```

### 1.4 Actualizar `src/lib/prisma.js`

Simplificar la conexión (ya no necesita `@prisma/adapter-pg` custom):

```js
import { PrismaClient } from '@/generated/prisma';

const globalForPrisma = globalThis;
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

### 1.5 Eliminar archivos Firebase

- `src/firebaseConfig.js`
- `src/lib/firebase/admin.js`
- Cualquier import de `firebase` o `firebase-admin`

### 1.6 Infraestructura de archivos — AWS S3

Crear `src/lib/s3.js` con:
- Cliente S3 configurado con las variables de entorno AWS
- `generateUploadUrl(key, contentType)` → Presigned PUT URL (5 min expiración)
- `generateDownloadUrl(key)` → Presigned GET URL (1 hora expiración)
- `deleteObject(key)` → Eliminar archivo

API route `POST /api/uploads/presigned-url`:
- Autenticado (requiere JWT)
- Recibe `{ fileName, contentType }`
- Genera key única: `profiles/{userId}/{uuid}.{ext}`
- Retorna `{ uploadUrl, fileUrl }`

El frontend sube directamente a S3 con la presigned URL, luego actualiza `profile_picture_url` en el usuario via `PUT /api/users/:id`.

---

## Paso 2: Refactor de Autenticación (replicando finidian-api, sin MFA)

### 2.1 Crear utilidad JWT — `src/lib/auth/jwt.js`

Replicar la estrategia de finidian-api:
- **Firma**: `jsonwebtoken.sign()` con `JWT_SECRET`
- **Payload**: `{ sub: userId, email, isTutorApproved }`
- **Expiración**: 7 días (configurable vía `JWT_EXPIRATION`)
- **Verificación**: `jsonwebtoken.verify()` con el mismo secreto

```js
// Funciones a exportar:
export function signToken(user) { ... }    // JWT principal (7d)
export function verifyToken(token) { ... } // Verificar JWT principal
```

### 2.2 Crear middleware de autenticación — `src/lib/auth/middleware.js`

Replicar el patrón guard de finidian-api adaptado a Next.js API routes:

```js
// Extrae Bearer token del header Authorization
// Verifica con jwt.verify()
// Retorna el payload del usuario o lanza error 401
export async function authenticateRequest(request) { ... }
```

### 2.3 Refactor de registro — `POST /api/auth/register`

**Antes (Firebase):**
1. `admin.auth().createUser()` → Firebase crea usuario
2. Guardar perfil en PostgreSQL con UID de Firebase

**Después (JWT propio, como finidian-api):**
1. Validar input con Zod
2. Verificar que email no exista en `users`
3. Hashear contraseña con `bcrypt.hash(password, 10)` (mismo salt rounds que finidian)
4. Crear usuario en PostgreSQL con `prisma.user.create()`
5. Generar `verificationToken` (32-byte hex)
6. Enviar email de verificación vía Brevo (mantener servicio actual)
7. Firmar JWT y retornar `{ token, user }`
8. **Si `isTutor`**: marcar `isTutorRequested: true` (NO crear `tutor_profiles` aún)

### 2.4 Refactor de login — `POST /api/auth/login`

**Flujo simplificado (sin MFA):**
1. Buscar usuario por email (`prisma.user.findUnique`)
2. Verificar contraseña con `bcrypt.compare()`
3. Verificar `isActive` y `isEmailVerified`
4. Firmar JWT y retornar `{ token, user }`

### 2.5 Validación de doble email (específico de Calico)

Para tutores aprobados, al crear `tutor_profiles`:
- `users.email` → email general de login
- `tutor_profiles.school_email` → correo institucional (`@.edu.co`)
- Validar formato del school_email con regex en el endpoint de solicitud de tutor

### 2.6 Refactor de verificación de email

Mantener el flujo actual (ya está en PostgreSQL), pero eliminar la parte de `admin.auth().updateUser()` de Firebase.

### 2.7 Refactor de reset de contraseña

**Antes**: Actualizaba contraseña en Firebase via `admin.auth().updateUser()`
**Después**: Actualiza `password_hash` directamente en PostgreSQL con bcrypt

### 2.8 Refactor del cliente — `src/app/services/utils/AuthService.js`

**Eliminar:**
- `signInWithEmailAndPassword()` de Firebase Client SDK
- `signInWithCustomToken()`
- `onAuthStateChanged()`
- `getIdToken()`
- Todo import de `firebase/auth`

**Reemplazar con:**
- Almacenar JWT en `localStorage` con key `calico_auth_token`
- Enviar `Authorization: Bearer <jwt>` en cada request (ya se hace, solo cambiar la fuente del token)
- `me()` → sigue llamando a `/api/users/:id` pero con el nuevo JWT

### 2.9 Refactor de `SecureAuthContext.js`

**Eliminar:**
- `onAuthStateChanged()` listener
- Firebase auth state management

**Reemplazar con:**
- Al montar: leer JWT de localStorage
- Verificar validez llamando a `/api/auth/me` (nuevo endpoint)
- Si válido: cargar datos del usuario
- Si inválido/expirado: limpiar localStorage y redirigir a login

### 2.10 Eliminar archivos MFA

- `src/app/components/MfaSetupModal/`
- `src/app/components/MfaVerifyModal/`
- `src/app/components/MfaSecurityCard/`
- `src/app/components/MfaDisableModal/`
- `src/app/services/utils/MfaService.js`
- `src/lib/services/mfa.service.js`
- `src/app/api/auth/mfa/` (todo el directorio)

---

## Paso 3: Migración de Modelos de Datos

### 3.1 Mapeo de modelos antiguos → nuevos

| Modelo Anterior (Prisma actual) | Modelo Nuevo | Cambios Clave |
|---|---|---|
| `User` (id = Firebase UID string) | `User` (id = UUID string) | UUID auto-generado, se agrega `password_hash` y `profile_picture_url`, se elimina `role` string por `is_tutor_*` booleans, se eliminan todos los campos MFA |
| `Major` (tabla separada) | `major` campo enum en `User` | De relación a enum directamente en user |
| `Course` | `Course` | Se agrega `complexity` enum y `base_price`, se eliminan `credits`, `faculty`, `prerequisites` |
| `UserCourse` | `TutorCourse` | Ahora referencia `tutor_profiles` y agrega `custom_price` |
| `Availability` (slots con googleEventId) | `Availability` (bloques semanales recurrentes) | Modelo completamente diferente: `day_of_week` + `start_time`/`end_time` en vez de datetime absolutos |
| `TutoringSession` | `Session` + `SessionParticipant` | Sesiones grupales, status enum limpio, sin campos Google Calendar internos |
| `Review` (por reviewerEmail) | `Review` (por reviewer_id/reviewee_id) | Bidireccional, por UUIDs no emails, constraint unique por sesión |
| `SlotBooking` | **ELIMINADO** | La lógica de slots se simplifica con el nuevo modelo de disponibilidad |

### 3.2 Nuevo: `TutorProfile`

- Se crea solo cuando un admin aprueba la solicitud de tutor
- Contiene `school_email` para validación institucional
- Relación 1:1 con `User`

### 3.3 Nuevos: `Schedule` y `Topic`

- `Schedule`: configuración de agendamiento por usuario (timezone, buffer, etc.)
- `Topic`: subtemas dentro de un curso

---

## Paso 4: Refactor de Lógica de Negocio

### 4.1 Repositories — Reescribir completamente

Cada repository se adapta al nuevo schema Prisma:

| Repository | Cambios |
|---|---|
| `user.repository.js` | IDs UUID, `passwordHash`, `isTutorApproved` en vez de `role`, include `tutorProfile`, campo `profilePictureUrl` |
| `academic.repository.js` | Courses con `complexity`/`basePrice`, Topics nuevo, Majors eliminado (es enum) |
| `availability.repository.js` | Modelo completamente nuevo: bloques semanales recurrentes |
| `tutoring-session.repository.js` → `session.repository.js` | Nuevo modelo con `SessionParticipant`, status enum, sin campos Google internos |
| `slot-booking.repository.js` | **ELIMINAR** — absorbido por el nuevo modelo de sesiones |

### 4.2 Services — Adaptar

#### Disponibilidad (CRUD de bloques de tiempo libre)

```
POST   /api/availabilities       → Crear bloque (validar no overlap)
GET    /api/availabilities/:userId → Listar bloques del usuario
PUT    /api/availabilities/:id   → Actualizar bloque
DELETE /api/availabilities/:id   → Eliminar bloque
```

- Validar que `start_time < end_time`
- Validar que no haya solapamiento con otros bloques del mismo día
- Solo tutores aprobados pueden crear disponibilidad

#### Sesiones (con validación de overbooking + transacciones)

```
POST /api/sessions              → Crear sesión (estudiante solicita)
PUT  /api/sessions/:id/accept   → Tutor acepta
PUT  /api/sessions/:id/reject   → Tutor rechaza
PUT  /api/sessions/:id/complete → Marcar completada
PUT  /api/sessions/:id/cancel   → Cancelar
```

Lógica de creación con transacción Prisma:
```js
await prisma.$transaction(async (tx) => {
  // 1. Verificar que el tutor tiene disponibilidad en ese horario
  // 2. Verificar que no hay sesión ya aceptada en ese slot (anti-overbooking)
  // 3. Para grupales: verificar max_capacity
  // 4. Crear sesión + session_participant en una sola transacción
});
```

#### Google Calendar — Sincronización bidireccional

Al aceptar una sesión:
1. Crear evento en Google Calendar del tutor (mantener lógica actual de `calendar.service.js`)
2. Guardar referencia del evento (se puede agregar campo `google_event_id` a `sessions` si necesario)

Al cancelar una sesión:
1. Eliminar evento de Google Calendar

La integración con Google Calendar se mantiene intacta — solo se adaptan las referencias al nuevo modelo de sesiones.

#### Reseñas bidireccionales

```
POST /api/sessions/:id/reviews  → Crear reseña
GET  /api/users/:id/reviews     → Obtener reseñas de un usuario
```

Validaciones:
- La sesión debe tener `status = 'Completed'`
- El reviewer debe ser participante de la sesión (tutor o estudiante)
- El reviewee debe ser el otro participante
- Constraint unique `(session_id, reviewer_id, reviewee_id)` previene duplicados

---

## Paso 5: Limpieza Final

### 5.1 Eliminar dependencias Firebase

```bash
npm uninstall firebase firebase-admin
```

### 5.2 Eliminar archivos

- `src/firebaseConfig.js`
- `src/lib/firebase/` (todo el directorio)
- `src/app/api/firebase/` (diagnósticos)
- Todos los archivos MFA (listados en Paso 2.10)
- Variables `NEXT_PUBLIC_FIREBASE_*` del `.env`
- Variables `FIREBASE_*` del `.env`

### 5.3 Google Calendar — Adaptar (NO eliminar)

- **Mantener**: `src/app/api/calendar/`, `src/app/api/calico-calendar/`, `src/lib/services/calendar.service.js`, `src/lib/services/calico-calendar.service.js`
- **Adaptar**: Referencias al nuevo modelo de sesiones (UUIDs, nuevo schema)
- **Mantener variables**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_ADMIN_REFRESH_TOKEN`, `CALICO_CALENDAR_ID`

### 5.4 Eliminar modelos Prisma obsoletos

- `SlotBooking`
- `Major` (tabla — ahora es enum en `User`)
- `TutoringSession` → reemplazado por `Session`
- Todos los campos MFA del modelo `User`

### 5.5 Limpiar rutas del frontend

- Actualizar `src/routes.js` si cambian paths
- Eliminar imports de Firebase en componentes
- Actualizar `SecureAuthContext` para usar JWT propio
- Eliminar páginas/componentes MFA

### 5.6 Actualizar `.gitignore` y limpiar `.env`

- Asegurar que `.env` NO esté commiteado (actualmente tiene secretos expuestos)
- Crear `.env.example` con las nuevas variables (sin valores reales)

---

## Orden de Ejecución Sugerido

| Fase | Descripción | Dependencias |
|------|-------------|-------------|
| **1** | Setup Prisma (nuevo schema con UUIDs) + variables de entorno + eliminar Firebase SDKs + setup S3 | Ninguna |
| **2a** | JWT utils + middleware de auth | Fase 1 |
| **2b** | Registro y login (sin MFA) | Fase 2a |
| **2c** | Verificación email + reset password | Fase 2b |
| **2d** | Refactor frontend (AuthService + SecureAuthContext) + eliminar MFA | Fase 2b |
| **3** | Repositories nuevos (user, course, availability, session, review) | Fase 1 |
| **4a** | CRUD de disponibilidad | Fase 3 |
| **4b** | Sesiones con transacciones + sincronización Google Calendar | Fase 3 |
| **4c** | Reseñas bidireccionales | Fase 4b |
| **5** | Limpieza final (eliminar archivos, deps, variables) | Todo lo anterior |

---

## Referencia: Patrón de Auth de finidian-api (adaptado sin MFA)

| Concepto | Implementación en finidian-api | Adaptación para Calico |
|---|---|---|
| Hashing | `bcrypt.hash(password, 10)` | Idéntico |
| JWT signing | `jwt.sign({ sub, email, role }, JWT_SECRET_MANAGMENT, { expiresIn: '7d' })` | `jwt.sign({ sub, email, isTutorApproved }, JWT_SECRET, { expiresIn: '7d' })` |
| JWT guard | Passport-JWT extracting Bearer token | Función middleware custom (Next.js no usa Passport) |
| Token storage (client) | `localStorage['userDataUser']` | `localStorage['calico_auth_token']` |
| Request interceptor | Axios interceptor agrega Bearer | `fetch` wrapper o middleware de AuthService |
| File storage | AWS S3 con presigned URLs | Idéntico (nuevo para Calico, reemplaza Firebase Storage) |
