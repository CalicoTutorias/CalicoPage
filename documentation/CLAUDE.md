# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Calico Monitorias is a tutor marketplace platform built as a monolithic Next.js 15 (App Router) application. Students find and book tutors; tutors manage availability via Google Calendar; payments are processed through Wompi. Stack: React 19, Tailwind CSS v4, shadcn/ui (new-york style, JSX not TSX), **PostgreSQL + Prisma ORM**, custom JWT auth (bcrypt + jsonwebtoken), AWS S3, Brevo (email), Wompi (payments), Google Calendar/Drive APIs, Zod validation.


## Commands

```bash
npm run dev          # Dev server on :3000
npm run build        # Production build
npm run start        # Production server (after build)
npm run lint         # ESLint (next/core-web-vitals)
npm test             # Jest single run
npm run test:watch   # Jest watch mode
npm run test:ci      # Jest CI mode

# Run a single test file or test name
npm test -- src/__tests__/services/email.service.test.js
npm test -- -t "sends verification email"

# Database (Prisma)
npm run db:generate  # Regenerate Prisma client (src/generated/prisma/)
npm run db:migrate   # Run migrations (dev)
npm run db:push      # Push schema without migration
npm run db:studio    # Open Prisma Studio UI
npm run db:seed      # Run prisma/seed.js
```

### Test Layout
- Jest config: `jest.config.mjs` (uses `next/jest`, `jsdom` environment, preserves `@/` alias)
- Setup file: `src/setupTests.js`
- Test discovery: `**/__tests__/**/*.{js,jsx}` and `**/tests/**/*.{js,jsx}` — co-located near source (e.g. `src/app/api/.../__tests__/`) or under `src/__tests__/`
- File-level mocks: CSS → `identity-obj-proxy`; static assets → `test/__mocks__/fileMock.js`

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


### Key Conventions

- **Path alias**: `@/` maps to `src/`. The `paths` must live in **`tsconfig.json`** (Turbopack reads it; when a `tsconfig.json` exists it shadows `jsconfig.json`). `jsconfig.json` keeps a copy and `next.config.mjs` adds a webpack alias — so it resolves under both webpack and `next dev --turbopack`. Missing it from `tsconfig.json` breaks every `@/` import under Turbopack.
- **Prisma client**: generated to `src/generated/prisma/`, singleton in `src/lib/prisma.js`
- **API routes**: Export named `GET`, `POST`, `PUT`, `DELETE` functions. Always `await params` before accessing properties (Next.js 15 requirement).
- **Repositories**: Named exports (not classes), wrap Prisma queries
- **Frontend services**: Class-based singletons exported as instances (e.g., `export const UserService = new UserServiceClass()`)
- **Components**: Co-located with CSS files in folders (e.g., `Header/Header.jsx` + `Header/Header.css`)
- **shadcn/ui**: Installed to `src/components/ui/`, configured with `tsx: false`, lucide-react icons
- **i18n**: Custom `I18nProvider` with `useI18n()` hook providing `t()`, `locale`, `formatCurrency()`, `formatDate()`; default locale is `es` (Spanish), `en` available; translations in `src/lib/i18n/locales/{es,en}.json`. **No hardcoded user-facing text** — see [Internationalization (i18n)](#internationalization-i18n)
- **Auth**: Custom JWT — client stores token in `localStorage` under key `calico_auth_token` → `Authorization: Bearer <token>` header → `authenticateRequest()` verifies server-side
- **Validation**: Zod at API boundaries
- **Passwords**: bcrypt with 10 salt rounds. `passwordHash` is **never** returned to the client (sanitized in all repository responses)
- **Sensitive fields**: `verificationToken`, `resetToken`, `otpCode` are never exposed in API responses

### Auth Flow

1. **Register** → `POST /api/auth/register` → hash password → create user → send verification email via Brevo (no JWT issued — email must be verified first)
2. **Verify email** → user clicks link → `/auth/confirm-email` → explicit click → `POST /api/auth/verify-email` marks verified
3. **Login** → `POST /api/auth/login` → bcrypt compare → rejects if `!isEmailVerified` → return JWT
4. **Client** → store JWT in `localStorage` as `calico_auth_token`
5. **Protected routes** → `authenticateRequest(request)` in `src/lib/auth/middleware.js` extracts and verifies Bearer token
6. **App mount** → `GET /api/auth/me` validates token and loads user profile into `SecureAuthContext`

JWT payload: `{ sub: userId, email, isTutorRequested, isTutorApproved, iat, exp }`. Expiry set via `JWT_EXPIRATION` env var (default `7d`).

### Tutor Role Flow

1. Student calls `POST /api/auth/request-tutor` → `isTutorRequested = true`
2. Admin approves → `isTutorApproved = true` + `TutorProfile` created
3. `requireTutor()` guard in `src/lib/auth/guards.js` enforces `isTutorApproved` on tutor-only endpoints

### Auth Guards (`src/lib/auth/guards.js`)

| Guard | Purpose | Header |
|-------|---------|--------|
| `authenticateRequest(request)` | Verify any logged-in user | `Authorization: Bearer <jwt>` |
| `requireTutor(request)` | Authenticated AND `isTutorApproved` | `Authorization: Bearer <jwt>` |
| `requireAdminUser(request)` | Authenticated AND DB `role = 'ADMIN'` (role read fresh from DB, not JWT) + `isActive` + 30 req/min limit. **Use this for human admins.** | `Authorization: Bearer <jwt>` |
| `requireAdminSecret(request)` | Compares `x-admin-secret` against `ADMIN_SECRET` env var (no JWT). Service/cron only. | `x-admin-secret: <secret>` |
| `requireAdmin(request)` | **@deprecated** alias of `requireAdminSecret` | `x-admin-secret: <secret>` |

All three return `NextResponse` on failure — early-return when `result instanceof NextResponse`.

---

## Database Schema (PostgreSQL + Prisma)

Schema: `prisma/schema.prisma`. Client output: `src/generated/prisma/`.

### Tables

| Table | PK type | Description |
|-------|---------|-------------|
| `users` | `String` (UUID) | Core user — auth + profile |
| `tutor_profiles` | `String` (userId, UUID) | Tutor-specific data (1:1 with user) |
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
Role:                       STUDENT | ADMIN
AuthProviderEnum:           Local | Google
ComplexityEnum:             Introductory | Foundational | Challenging
SessionTypeEnum:            Individual | Group
SessionStatusEnum:          Pending | Accepted | Rejected | Completed | Canceled
LocationTypeEnum:           Virtual | Custom
TutorApplicationStatusEnum: Pending | Approved | Rejected
TutorCourseStatusEnum:      Pending | Approved | Rejected
PaymentStatusEnum:          pending | paid | failed
TutorPayoutStatusEnum:      pending | paid
ReviewStatusEnum:           pending | done
```

> Majors/careers are **no longer an enum** — they are the `Department` + `Career`
> tables (UUID PKs). `User.careerId` is a UUID FK. The legacy `MajorEnum`
> (ISIS/MATE/…) was removed in the Firebase → PostgreSQL migration.

### Key Fields

- `User.isTutorRequested` / `isTutorApproved` — role gating
- `User.isEmailVerified` — hard login gate: `/api/auth/login` returns `EMAIL_NOT_VERIFIED` (403) until true; no JWT is issued anywhere before verification
- `User.lastSeenAt` (`last_seen_at`) — last time the user was in the app. Refreshed on login (local + Google) AND on the `/api/auth/me` heartbeat (throttled 30 min). Powers the admin "active users" engagement metric. Distinct from login: the JWT persists, so login alone would undercount.
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
| `/api/auth/register` | POST | — | Register + send verification email. **No JWT** — email must be verified, then login |
| `/api/auth/login` | POST | — | Email + password → JWT (rejected if `!isEmailVerified`) |
| `/api/auth/me` | GET | ✓ | Validate token, return user profile; refreshes `lastSeenAt` (engagement heartbeat, throttled 30 min) |
| `/api/auth/verify-email` | POST | — | Validate token → mark verified (explicit user click only) |
| `/api/auth/verify-email` | GET | — | No-op redirect to `/auth/confirm-email?token=` (scanner-safe; legacy emails) |
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

### Tutor Applications (`/api/tutor-applications/`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/tutor-applications` | POST | ✓ | Submit application (motivation, subjects, contact info) |

Backed by `tutor-application.service.js` + `tutor-application.repository.js`.

### Notifications (`/api/notifications/`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/notifications` | POST | ✓ | Create notification (internal use) |
| `/api/notifications/[id]` | GET/DELETE | ✓ | Single notification |
| `/api/notifications/[id]/read` | PUT | ✓ | Mark as read |
| `/api/notifications/read-all` | PUT | ✓ | Mark all as read |
| `/api/notifications/user/[userId]` | GET | ✓ | List user's notifications |
| `/api/notifications/user/[userId]/unread` | GET | ✓ | List unread |

Backed by `notification.service.js` + `notification.repository.js`.

### Payments — Wompi (`/api/payments/`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/payments/create-intent` | POST | ✓ | Create payment intent + Wompi reference. **Price is computed server-side** (course price × duration); any `amount` in the body is ignored. |
| `/api/payments/confirm-payment` | POST | ✓ | Confirm a completed payment |
| `/api/payments/webhook` | POST | — | Wompi webhook (signature-verified) |
| `/api/payments/test-webhook` | POST | — | Local webhook simulation |
| `/api/payments/[id]` | GET | ✓ | Payment details |
| `/api/payments/student/[email]` | GET | ✓ | Payments by student email |
| `/api/payments/tutor/[tutorId]` | GET | ✓ tutor | Payments owed/paid to a tutor |

Backed by `wompi.service.js` + `payment.repository.js`. Webhook integrity is enforced via HMAC against `WOMPI_INTEGRITY_SECRET`.

### Session Attachments

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/attachments/presigned-urls` | POST | ✓ | Batch presigned PUT URLs (subject-scoped — caller passes the course name). Used by the **booking** flow. |
| `/api/sessions/[id]/attachments/upload-urls` | POST | ✓ | **Session-scoped** presigned PUT URLs — verifies the caller is the session's student and derives the S3 subject from `session.course`. Used to add files **from history**. |
| `/api/sessions/[id]/attachments/register` | POST | ✓ | Persist DB rows for uploaded files (verifies participant + that each S3 key sits under `session-attachments/`). |
| `/api/sessions/[id]/attachments` | GET | ✓ | Presigned download URLs (access enforced server-side: student creator, or assigned tutor on Pending/Accepted sessions) |

Backed by `session-attachment.service.js` + `session-attachment.repository.js`. Students can attach files **at booking time AND later from `/home/history`** (max 5 per session, ≤10 MB, PDF/PNG/JPG/DOC/DOCX). Files are linked to the session **in the DB** (not by S3 path), so every batch — wherever its key lives — shows in the session's attachment list. The booking flow threads attachment metadata through the Wompi `metadata`; `bookPaidSession` registers it after payment.

### Admin (`/api/admin/`)

Auth is **mixed**: tutor management, `metrics/*`, `users*`, `audit` and `payouts/*` use `requireAdminUser` (Bearer JWT + DB `role = 'ADMIN'`, read fresh + 30 req/min). Legacy `course-prices*` and `tutor-courses*` still use `requireAdmin`/`x-admin-secret`. All mutations write to `admin_audit_log`. See [ADMIN_DASHBOARD_PLAN.md](ADMIN_DASHBOARD_PLAN.md) for the full design.

**Tutor management** (`requireAdminUser`)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/admin/tutors/pending` | GET | Pending applications + user + requested subjects |
| `/api/admin/tutors` | GET | Approved tutors (`?status=active|suspended`, `?search=`) |
| `/api/admin/tutors/[userId]` | GET | Tutor detail (profile, per-course status, latest application) |
| `/api/admin/tutors/[userId]/approve` | POST | Approve a subset of courseIds (rest → Rejected) |
| `/api/admin/tutors/[userId]/reject` | POST | Reject application (reason required) |
| `/api/admin/tutors/[userId]/suspend` | POST | Suspend + cancel future sessions |
| `/api/admin/tutors/[userId]/reinstate` | POST | Lift suspension |
| `/api/admin/tutors/[userId]/courses` | POST | Assign courses to an approved tutor |
| `/api/admin/tutors/[userId]/courses/[courseId]` | PUT | Set a single tutor↔course status |

**Metrics** (`requireAdminUser`, in-process TTL 5 min cache)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/admin/metrics/overview` | GET | KPI snapshot (sessions this week, Calico net this month, active tutors 30d, pending apps) |
| `/api/admin/metrics/sessions?weeks=N` | GET | Weekly session series (completed/canceled/upcoming) |
| `/api/admin/metrics/revenue?months=N` | GET | Monthly revenue series (gross + exact Calico net) |
| `/api/admin/metrics/top-courses?days=N&limit=K` | GET | Most-requested courses |
| `/api/admin/metrics/active-tutors?days=N&limit=K` | GET | Top tutors by completed sessions |
| `/api/admin/metrics/retention?days=N&careerId=` | GET | Repeat-purchase KPIs + active users (7d, by last-seen) |
| `/api/admin/metrics/retention/cohorts?months=N&careerId=` | GET | First-session cohorts (30/60/90-day return rate) |
| `/api/admin/metrics/profitability?days=N&departmentId=` | GET | Per-course Calico net, margin, net/session, break-even |

**Users directory** (`requireAdminUser`)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/admin/users?role=&search=` | GET | All users (student/tutor/admin), searchable, role-filtered. Safe `select` only (no secrets) |
| `/api/admin/users/[userId]` | GET | Full profile: identity + activity stats (student & tutor) + recent sessions |

**Payouts & audit** (`requireAdminUser`)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/admin/payouts?view=` | GET | Tutor payouts owed (`byTutor` digest / flat) |
| `/api/admin/payouts/[paymentId]/mark-paid` | POST | Mark one payout transferred |
| `/api/admin/payouts/bulk-mark-paid` | POST | Mark many payouts transferred |
| `/api/admin/audit` | GET | Paginated audit log (filters: action, adminId, targetType, from, to) |

**Legacy** (`requireAdmin` / `x-admin-secret`)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/admin/course-prices` | GET/POST | List or upsert course base prices |
| `/api/admin/course-prices/[courseId]` | DELETE | Remove course price |
| `/api/admin/tutor-courses` | GET/POST | Manage tutor↔course assignments |
| `/api/admin/tutor-courses/[tutorId]/[courseId]` | PUT/DELETE | Update/remove a single tutor↔course |

### Other

| Route | Method | Description |
|-------|--------|-------------|
| `/api/users/[id]` | GET/PUT | User profile |
| `/api/users/me/profile-picture` | PATCH/DELETE | Confirm a freshly-uploaded avatar / remove current avatar |
| `/api/users/me/profile-picture/presigned-url` | POST | Get presigned PUT URL for an avatar (mimeType + fileSize) |
| `/api/users/[id]/reviews` | GET | Reviews received by user |
| `/api/users/[id]/reviews/stats` | GET | Avg score + count |
| `/api/users/tutors` | GET | List approved tutors |
| `/api/tutors/[id]` | GET | Single tutor (public profile) |
| `/api/schedules/me` | GET/PUT | My schedule preferences |
| `/api/sessions/stats` | GET | Aggregated session stats |
| `/api/availabilities/sync-from-calendar` | POST | Pull availability from Google Calendar |
| `/api/auth/google` | POST | Verify Google ID token → create/link user → JWT |
| `/api/courses` | GET | All courses |
| `/api/courses/[id]` | GET | Single course |
| `/api/majors` | GET | All careers + their department (from DB, not an enum) |
| `/api/majors/[id]` | GET | Single career |

### Google Calendar (`/api/calendar/`, `/api/calico-calendar/`) — maintained unchanged

---

## External Services

### Brevo (Email)
REST API v3 (`https://api.sendinblue.com/v3/smtp/email`). Service: `src/lib/services/email.service.js`.

Env vars: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`

Template IDs — single source of truth is `TEMPLATE_IDS` in `email.service.js`:
- `2` — Email verification
- `3` — Password changed confirmation
- `4` — Password reset link
- `5` — Tutor application (admin notification)
- `7` — Session confirmed
- `8` — New session request / session cancelled (recipient)
- `9` — Session cancelled (admin)
- `10` — Course request (admin notification)
- `11` — Tutor application approved
- `12` — Tutor application rejected
- `13` — Tutor suspended

### AWS S3 (File Storage)
Service: `src/lib/s3.js`. Presigned URLs for direct browser → S3 uploads.

Env vars: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` (default `us-east-1`), `AWS_S3_BUCKET` (default `calico-uploads`)

Two flows:
- **Profile picture** (`profile-picture.service.js`): Client compresses to WebP 512×512 in Canvas → `POST /api/users/me/profile-picture/presigned-url` returns presigned PUT (tagged `status=unconfirmed`) → browser PUTs to S3 → `PATCH /api/users/me/profile-picture` headObject-verifies, persists the public URL on `users.profile_picture_url`, flips tag to confirmed, and deletes the previous picture (only when it lived under our `profile-pictures/{userId}/` prefix — never touches external OAuth avatars). `DELETE` clears the field + the S3 object.
- **Session attachments**: Two upload entry points share the same S3 key layout (`session-attachments/{subject-slug}/{YYYY-MM}/{batchId}/{file}`): the booking flow uses the subject-scoped `POST /api/attachments/presigned-urls`; adding files later from history uses the session-scoped `POST /api/sessions/[id]/attachments/upload-urls`. Both then `POST .../attachments/register` to persist DB rows. Downloads are short-lived presigned GETs from `/api/sessions/[id]/attachments`. Client uploads go through the `useFileUpload` hook — **its `uploadFiles()` returns the fresh metadata; never read the derived `uploadedFiles` right after awaiting an upload (stale-closure trap)**.

**Bucket policy requirement (profile pictures)**: The stored `profilePictureUrl` is the public S3 URL (consumed as `<img src>` across the app). The bucket needs a policy that allows `s3:GetObject` on `profile-pictures/*` for `Principal: *`. Example:

```json
{
  "Effect": "Allow",
  "Principal": "*",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::calico-uploads/profile-pictures/*"
}
```

Recommended companion: an S3 Lifecycle rule that deletes objects tagged `status=unconfirmed` after 24 h to reap orphans from abandoned uploads (same pattern as session attachments).

**Bucket policy requirement (profile pictures)**: The stored `profilePictureUrl` is the public S3 URL (consumed as `<img src>` across the app). The bucket needs a policy that allows `s3:GetObject` on `profile-pictures/*` for `Principal: *`. Example:

```json
{
  "Effect": "Allow",
  "Principal": "*",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::calico-uploads/profile-pictures/*"
}
```

Recommended companion: an S3 Lifecycle rule that deletes objects tagged `status=unconfirmed` after 24 h to reap orphans from abandoned uploads (same pattern as session attachments).

### Wompi (Payments)
Colombian payments processor. Service: `src/lib/services/wompi.service.js`.

Env vars: `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET`

Flow: Student calls `/api/payments/create-intent` → frontend renders Wompi widget with the returned reference → on completion Wompi calls `/api/payments/webhook` (HMAC-verified against `WOMPI_INTEGRITY_SECRET`) → service updates payment + linked session status, then triggers downstream notifications.

**Pricing (server-authoritative).** The charge is **never** taken from the client. Prices are **per hour** and centralized per course (`CoursePrice.price ?? Course.basePrice`):
- `src/lib/payments/session-amount.js` — pure, client-safe helpers: `pricePerHour(course)`, `sessionDurationHours(start, end)`, `computeSessionAmount(...)` = `price/hour × hours`.
- `src/lib/payments/pricing.js` — `resolveSessionAmount({ courseId, start, end })` loads the course and computes the amount server-side. `create-intent` uses this and **ignores any client `amount`**.
- The Wompi widget is initialized with the **server's** `amountInCents` (the integrity signature is computed for that exact amount — the client's local estimate would fail signature validation).
- `src/lib/payments/fees.js` — single source of truth for the commission split (Calico 15% / tutor 85%, Wompi 2.65% + $700 + 19% IVA, break-even). **Never re-implement `× 0.15` / `× 0.85` inline.** Used by payouts and the admin profitability metrics.

The booking page shows the same number it will charge by fetching `GET /api/courses/[id]` and reusing `computeSessionAmount` (client-safe — no prisma import).

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

# Wompi (payments)
WOMPI_PUBLIC_KEY=
WOMPI_PRIVATE_KEY=
WOMPI_INTEGRITY_SECRET=

# Admin (used by /api/admin/* via x-admin-secret header)
ADMIN_SECRET=
```

---

## Design System

Source of truth: [src/app/styles/design-tokens.css](src/app/styles/design-tokens.css). The file contains an extensive comment block at the top documenting every token group — read it before adding new CSS.

### Mandatory: use tokens, not literals

All new CSS must consume design tokens via `var(--token)`. **Magic numbers are not allowed** for the following properties — use the token instead:

| Property | Token group | Examples |
|---|---|---|
| `border-radius` | `--radius-xs/sm/md/lg/xl` | 6/8/10/12/16px |
| `box-shadow` (elevation) | `--elev-1/2/3/modal`, `--elev-1-up/2-up` for upward-facing (sticky bottom-nav, footers) | replace any `0 Npx Mpx rgba(...)` shadow |
| `font-size` (body/UI) | `--type-xs/caption/label/body-sm/body/body-lg` | 12/13/14/15/16/18px |
| `font-size` (headings) | `--type-h3/h2/h1/display` (clamp-based) | only for full responsive headings; verify no overflow in fixed-width cards/modals |
| `font-family` | `--font-sans-stack` | never declare `"DM Sans"`, `"Poppins"` directly |
| `max-width` (page-level) | `--app-shell-max-width`, `--modal-max-width`, `--form-narrow/default/wide` | 28rem, 32rem, 40rem, 1152px |
| `color` | `--calico-*`, role-aware `--page-section-accent`, `--tutor-accent`, etc. | brand colors only via tokens |

Allowed literals (intentional exceptions):
- `border-radius: 9999px` (pills) and `50%` (circles)
- `border-radius: 3px` only on scrollbar pseudo-elements (use `--radius-xs` if possible)
- Micro font-sizes (`8px`, `9px`, `10px`, `0.65rem`, `0.68rem`) for badges/indicators
- Existing `clamp()` declarations crafted for specific responsive scaling
- `em` units (relative to parent — different semantic from rem)

### Breakpoint scale (Tailwind-aligned)

```
480px   xs (micro)  — phones, único nivel sub-Tailwind oficialmente aceptado
640px   sm          — landscape phones / small tablets
768px   md          — tablets, navbar split, table → card style
1024px  lg          — small desktops, multi-column layouts
1280px  xl          — full desktops
```

`@media` queries must use one of the 5 values above. Do not introduce custom breakpoints (e.g., 900, 920, 1100, 1200). Off-by-one values are permitted only for cascade exclusion (`max-width: 1023px` paired with `min-width: 1024px`, etc.).

### Components base — always prefer `<Button>`

For any button or actionable element, use [`<Button>`](src/components/ui/button.jsx) from `src/components/ui/`. Do not author bespoke button CSS.

Available variants:

| Variant | Use case |
|---|---|
| `default` | Generic primary (shadcn theme primary) |
| `cta` | Brand orange CTA (student/marketing flows) |
| `tutor` | Brand blue CTA (tutor flows) |
| `success` | Confirm/save actions (green) |
| `destructive` | Delete/cancel actions (red) |
| `outline` | Secondary action with border |
| `secondary`, `ghost`, `link` | Tertiary / inline actions |

Available sizes: `sm` (h-8), `default` (h-9), `lg` (h-10), `xl` (h-12), `pill` (rounded-full + font-bold), `icon`/`icon-sm`/`icon-lg`.

For toggle groups (e.g., period filters), use `<Button>` with conditional `variant` + `aria-pressed` instead of installing `ToggleGroup` (project keeps shadcn footprint minimal).

### Maintainability rules

1. **Avoid uncontrolled cascade**: do not redefine the same selector multiple times in one CSS file with different intents. The earnings table in `Statistics.css` had a 7-cell JSX vs 6-col grid mismatch from a duplicated definition — keep one source per selector.
2. **One file per component**: co-located CSS only. Do not introduce shared CSS files unless they live under `src/app/styles/` and are imported by the layout that needs them.
3. **Lint before merge**: a manual sweep of `grep -rE "border-radius:\s*[0-9]+(px|rem)" src --include="*.css"` should return zero matches outside the documented exceptions above. Same for `font-size` and `box-shadow`.
4. **Component overrides via `className`, not new CSS**: when migrating buttons, the toolbar pills in UnifiedAvailability keep small color overrides as `className="add-slot-btn"` while shape/typography come from `<Button size="pill">`. Do not duplicate shape/font in custom CSS — only add the brand-specific delta.
5. **Document new tokens**: if you add a token to `design-tokens.css`, update its comment block at the top of the file.

---

## Internationalization (i18n)

The entire UI is bilingual **Spanish/English**. User-facing text is never hardcoded — it is referenced by key and resolved against the active locale.

### Files

```
src/lib/i18n/index.jsx          ← I18nProvider + useI18n() hook
src/lib/i18n/locales/es.json    ← Spanish (default)
src/lib/i18n/locales/en.json    ← English
```

### Usage

```jsx
import { useI18n } from '@/lib/i18n';

const { t, locale, formatCurrency, formatDate } = useI18n();
t('tutorProfile.subjects.title');                  // simple lookup
t('tutorProfile.availability.title', { course });  // {var} interpolation
```

`t()` does a dot-path lookup into the active locale JSON and interpolates `{var}` placeholders. Locale is persisted to `localStorage` + cookie. `formatCurrency`/`formatDate` use `Intl` with the right locale (`es-CO`/`en-US`).

### Conventions

1. **One namespace per view** — group a screen's keys under their own object (e.g. `tutorProfile`, `search`, `availability`). Admin-facing keys live under their own namespaces; don't reuse a public namespace for admin text.
2. **Parity across locales** — every key MUST exist in both `es.json` and `en.json`. In dev the provider emits `console.warn('[i18n] Missing translation for key: ...')` when a key resolves to itself.
3. **No automatic pluralization** — `t()` does not handle plurals. Use `_one`/`_other` keys and pick in JS: `t(n === 1 ? 'x.review_one' : 'x.review_other', { count: n })`. This matches the existing admin pattern (`selected_one`/`selected_other`).
4. **Never translate DB data** — tutor names, course names, reviews, bios, and the `COP` currency code are rendered as-is.
5. **Locale-aware formatting** — use `formatCurrency`/`formatDate`, or pass the app `locale` to `toLocaleString` (`locale === 'en' ? 'en-US' : 'es-CO'`). Never let it fall back to the browser locale.
6. **Decorative images** — illustrative `<img>` use `alt=""` so screen readers skip them, instead of a fixed-language label.
7. **Validate JSON after editing locales** — `node -e "JSON.parse(require('fs').readFileSync('src/lib/i18n/locales/en.json','utf8'))"` for both files; a trailing comma silently breaks the whole locale.

---

## Critical Rules

1. **Follow existing layered architecture** — don't skip layers (e.g., don't call repositories from API routes directly)
2. **New domains follow the same four-layer pattern**: `src/lib/repositories/<domain>.repository.js` → `src/lib/services/<domain>.service.js` → `src/app/api/<domain>/route.js` → `src/app/services/core/<Domain>Service.js` (frontend singleton). Use the existing `notification`, `payment`, `session-attachment`, and `tutor-application` modules as references.
3. **Never expose sensitive fields** — `passwordHash`, `verificationToken`, `resetToken`, `otpCode` must be stripped from all API responses
4. **Filter on server, not client** — never fetch all rows then filter in JS; use Prisma `where` clauses
5. **Await params in API routes**: `const resolvedParams = await params; const { id } = resolvedParams;`
6. **Identity comes from the JWT, never the request body** — extract `auth.sub` after `authenticateRequest`; never trust user IDs sent in the body or URL when authoring on behalf of a user (prevents IDOR)
7. **Prefer IDs over emails** for references (`tutorId` not `tutorEmail`)
8. **Minimize code** — smallest possible change, no unnecessary wrappers, delete unused code
9. **Prisma client is a singleton** — always import from `src/lib/prisma.js`, never instantiate `PrismaClient` directly
10. **Google Calendar events** are created when a session is **accepted** (not when availability is set), and deleted when **canceled**
11. **Wompi webhook** must verify the HMAC signature against `WOMPI_INTEGRITY_SECRET` before mutating any payment/session state
12. **No hardcoded user-facing text** — every visible string goes through `t()` with a key defined in **both** `es.json` and `en.json` (see [Internationalization](#internationalization-i18n))
13. **Session price is server-authoritative** — compute the charge from course price × duration via `src/lib/payments/pricing.js`; never trust an `amount` from the client body. Fee/commission math has a single source of truth in `src/lib/payments/fees.js` — never re-implement the split inline.

## Related Documentation

- [ADMIN_DASHBOARD_PLAN.md](ADMIN_DASHBOARD_PLAN.md) — Admin panel design & execution status
- [testing/STUDENT_BOOKING_TESTS.md](testing/STUDENT_BOOKING_TESTS.md) — Student booking test suite
- [flujo_materias](flujo_materias) — Tutor lifecycle & course approval flow (business spec)
- [../README.md](../README.md) — Project overview & quick start
