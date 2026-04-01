# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Calico Monitorias is a tutor marketplace platform built as a monolithic Next.js 15 (App Router) application. Students find and book tutors; tutors manage availability via Google Calendar. Stack: React 19, Tailwind CSS v4, shadcn/ui (new-york style, JSX not TSX), **PostgreSQL + Prisma ORM**, custom JWT auth (bcrypt + jsonwebtoken), AWS S3, Brevo (email), Google Calendar/Drive APIs, Zod validation.

> Firebase has been fully removed. There is no `firebase` or `firebase-admin` dependency.

## Commands

```bash
npm run dev          # Dev server on :3000
npm run build        # Production build
npm run lint         # ESLint (next/core-web-vitals)
npm test             # Jest single run
npm run test:watch   # Jest watch mode

# Database (Prisma)
npm run db:generate  # Regenerate Prisma client (src/generated/prisma/)
npm run db:migrate   # Run migrations (dev)
npm run db:push      # Push schema without migration
npm run db:studio    # Open Prisma Studio UI
npm run db:seed      # Run prisma/seed.js
```

## Architecture

### Data Flow (strict layered pattern)

```
React Component → Frontend Service (src/app/services/core/) → fetch('/api/...')
  → API Route Handler (src/app/api/.../route.js)
    → Business Logic Service (src/lib/services/)
      → Repository (src/lib/repositories/)
        → Prisma Client → PostgreSQL
```

### Server vs Client Boundary

- **Server-only** (`src/lib/`, `src/app/api/`): Prisma, repositories, business services, Google APIs, JWT verification, bcrypt, S3 SDK, Brevo calls
- **Client-only** (`src/app/components/`, `src/app/services/`, `src/app/hooks/`, `src/app/context/`): browser APIs, `fetch('/api/...')` calls, localStorage token management

Never import server-only modules (prisma, bcrypt, jsonwebtoken) in client code. Never access server env vars (without `NEXT_PUBLIC_` prefix) from client code.

### Key Conventions

- **Path alias**: `@/` maps to `src/` (defined in `jsconfig.json`)
- **Prisma client**: generated to `src/generated/prisma/`, singleton in `src/lib/prisma.js`
- **API routes**: Export named `GET`, `POST`, `PUT`, `DELETE` functions. Always `await params` before accessing properties (Next.js 15 requirement).
- **Repositories**: Named exports (not classes), wrap Prisma queries
- **Frontend services**: Class-based singletons exported as instances (e.g., `export const UserService = new UserServiceClass()`)
- **Components**: Co-located with CSS files in folders (e.g., `Header/Header.jsx` + `Header/Header.css`)
- **shadcn/ui**: Installed to `src/components/ui/`, configured with `tsx: false`, lucide-react icons
- **i18n**: Custom `I18nProvider` with `useI18n()` hook providing `t()`, default locale is `es` (Spanish), translations in `src/lib/i18n/locales/`
- **Auth**: Custom JWT — client stores token in `localStorage` under key `calico_auth_token` → `Authorization: Bearer <token>` header → `authenticateRequest()` verifies server-side
- **Validation**: Zod at API boundaries
- **Passwords**: bcrypt with 10 salt rounds. `passwordHash` is **never** returned to the client (sanitized in all repository responses)
- **Sensitive fields**: `verificationToken`, `resetToken`, `otpCode` are never exposed in API responses

### Auth Flow

1. **Register** → `POST /api/auth/register` → hash password → create user → send verification email via Brevo → return JWT
2. **Login** → `POST /api/auth/login` → bcrypt compare → return JWT
3. **Client** → store JWT in `localStorage` as `calico_auth_token`
4. **Protected routes** → `authenticateRequest(request)` in `src/lib/auth/middleware.js` extracts and verifies Bearer token
5. **App mount** → `GET /api/auth/me` validates token and loads user profile into `SecureAuthContext`

JWT payload: `{ sub: userId, email, isTutorRequested, isTutorApproved, iat, exp }`. Expiry set via `JWT_EXPIRATION` env var (default `7d`).

### Tutor Role Flow

1. Student calls `POST /api/auth/request-tutor` → `isTutorRequested = true`
2. Admin approves → `isTutorApproved = true` + `TutorProfile` created
3. `requireTutor()` guard in `src/lib/auth/guards.js` enforces `isTutorApproved` on tutor-only endpoints

---

## Database Schema (PostgreSQL + Prisma)

Schema: `prisma/schema.prisma`. Client output: `src/generated/prisma/`.

### Tables

| Table | PK type | Description |
|-------|---------|-------------|
| `users` | `Int` (autoincrement) | Core user — auth + profile |
| `tutor_profiles` | `Int` (userId) | Tutor-specific data (1:1 with user) |
| `courses` | `UUID` | Academic courses with complexity + base price |
| `topics` | `UUID` | Course subtopics |
| `tutor_courses` | composite (tutorId, courseId) | Many-to-many tutor ↔ course with custom price |
| `schedules` | `UUID` | Tutor schedule preferences (1:1 with user) |
| `availabilities` | `UUID` | Weekly recurring time blocks per tutor |
| `sessions` | `UUID` | Tutoring session (Individual or Group) |
| `session_participants` | composite (sessionId, studentId) | Students enrolled in a session |
| `reviews` | `UUID` | Bidirectional rating per session (unique: sessionId + reviewerId + revieweeId) |

### Enums

```
MajorEnum:         ISIS | MATE | FISI | ADMI | ICIV | IMEC
ComplexityEnum:    Introductory | Foundational | Challenging
SessionTypeEnum:   Individual | Group
SessionStatusEnum: Pending | Accepted | Rejected | Completed | Canceled
LocationTypeEnum:  Virtual | Custom
```

### Key Fields

- `User.isTutorRequested` / `isTutorApproved` — role gating
- `User.isEmailVerified` — required before login is useful
- `Schedule.autoAcceptSession` — auto-accept incoming session requests
- `Schedule.bufferTime` — minutes between sessions (default 15)
- `Availability.dayOfWeek` — 0 (Sunday) to 6 (Saturday)
- `Session.maxCapacity` — 1 for Individual, 2–20 for Group

---

## API Routes

All protected routes require `Authorization: Bearer <token>`.

### Auth (`/api/auth/`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/auth/register` | POST | — | Register, send verification email, return JWT |
| `/api/auth/login` | POST | — | Email + password → JWT |
| `/api/auth/me` | GET | ✓ | Validate token, return user profile |
| `/api/auth/verify-email` | GET | — | Validate token → redirect to `/auth/email-verified?status=` |
| `/api/auth/resend-verification` | POST | — | Resend verification email |
| `/api/auth/forgot-password` | POST | — | Send password reset link via Brevo |
| `/api/auth/reset-password` | POST | — | Validate token → set new password |
| `/api/auth/check-verification` | GET | — | Check if email is verified |
| `/api/auth/change-password` | POST | ✓ | Change password (authenticated) |
| `/api/auth/request-tutor` | POST | ✓ | Request tutor role |
| `/api/auth/verify-otp` | POST | — | OTP verification |

### Sessions (`/api/sessions/`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/sessions` | POST | ✓ | Create session (student books tutor) |
| `/api/sessions` | GET | ✓ | My sessions (tutor or student) |
| `/api/sessions/[id]` | GET | ✓ | Session details + reviews |
| `/api/sessions/[id]/accept` | PUT | ✓ tutor | Accept → create Google Calendar event |
| `/api/sessions/[id]/reject` | PUT | ✓ tutor | Reject session |
| `/api/sessions/[id]/complete` | PUT | ✓ tutor | Mark completed (enables reviews) |
| `/api/sessions/[id]/cancel` | PUT | ✓ | Cancel → delete Google Calendar event |
| `/api/sessions/[id]/join` | POST | ✓ | Join group session |
| `/api/sessions/[id]/reviews` | POST | ✓ | Create/update review |

### Availabilities (`/api/availabilities/`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/availabilities` | POST | ✓ tutor | Create weekly block |
| `/api/availabilities` | GET | — | List all blocks |
| `/api/availabilities/[id]` | GET/PUT/DELETE | ✓ | Single block CRUD |
| `/api/availabilities/me` | GET | ✓ | My availability blocks |
| `/api/availabilities/bulk-replace` | POST | ✓ tutor | Replace all blocks atomically |

### Tutor (`/api/tutor/`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/tutor/profile` | GET/PUT | ✓ tutor | Tutor profile CRUD |
| `/api/tutor/courses` | GET/POST | ✓ tutor | Manage courses offered |
| `/api/tutor/courses/[courseId]` | PUT/DELETE | ✓ tutor | Update/remove a course |

### Other

| Route | Method | Description |
|-------|--------|-------------|
| `/api/users/[id]` | GET/PUT | User profile |
| `/api/users/[id]/reviews` | GET | Reviews received by user |
| `/api/users/[id]/reviews/stats` | GET | Avg score + count |
| `/api/users/tutors` | GET | List approved tutors |
| `/api/schedules/me` | GET/PUT | My schedule preferences |
| `/api/courses` | GET | All courses |
| `/api/courses/[id]` | GET | Single course |
| `/api/majors` | GET | Available majors (enum values) |

### Google Calendar (`/api/calendar/`, `/api/calico-calendar/`) — maintained unchanged

---

## External Services

### Brevo (Email)
REST API v3 (`https://api.sendinblue.com/v3/smtp/email`). Service: `src/lib/services/email.service.js`.

Env vars: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`

Template IDs (configure in Brevo dashboard):
- `13` — Email verification
- `14` — Password reset link
- `15` — Password changed confirmation

### AWS S3 (File Storage)
Service: `src/lib/s3.js`. Presigned URLs for direct browser → S3 uploads.

Env vars: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` (default `us-east-1`), `AWS_S3_BUCKET` (default `calico-uploads`)

Flow: Frontend requests presigned PUT URL → uploads directly to S3 → saves URL in `profile_picture_url` via `PUT /api/users/:id`.

### Google Calendar — maintained unchanged
Env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_ADMIN_REFRESH_TOKEN`, `CALICO_CALENDAR_ID`, `GDRIVE_PAYMENT_FOLDER_ID`

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/calico

# JWT
JWT_SECRET=<64+ char random secret>
JWT_EXPIRATION=7d

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
AWS_S3_BUCKET=calico-uploads

# Brevo (email)
BREVO_API_KEY=
BREVO_SENDER_EMAIL=
BREVO_SENDER_NAME=Calico Tutorias

# Google Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_ADMIN_REFRESH_TOKEN=
CALICO_CALENDAR_ID=
GDRIVE_PAYMENT_FOLDER_ID=
```

---

## Critical Rules

1. **Follow existing layered architecture** — don't skip layers (e.g., don't call repositories from API routes directly)
2. **Never expose sensitive fields** — `passwordHash`, `verificationToken`, `resetToken`, `otpCode` must be stripped from all API responses
3. **Filter on server, not client** — never fetch all rows then filter in JS; use Prisma `where` clauses
4. **Await params in API routes**: `const resolvedParams = await params; const { id } = resolvedParams;`
5. **Prefer IDs over emails** for references (`tutorId` not `tutorEmail`)
6. **Minimize code** — smallest possible change, no unnecessary wrappers, delete unused code
7. **Prisma client is a singleton** — always import from `src/lib/prisma.js`, never instantiate `PrismaClient` directly
8. **Google Calendar events** are created when a session is **accepted** (not when availability is set), and deleted when **canceled**

## Related Documentation

- [AGENT.md](AGENT.md) — Comprehensive developer and AI assistant guide
- [API_ENDPOINTS.md](API_ENDPOINTS.md) — API reference
- [MONOLITH_ARCHITECTURE.md](MONOLITH_ARCHITECTURE.md) — Architecture details
- [MIGRATION_PLAN.md](MIGRATION_PLAN.md) — Firebase → PostgreSQL migration notes
