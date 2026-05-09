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

### Auth Guards (`src/lib/auth/guards.js`)

| Guard | Purpose | Header |
|-------|---------|--------|
| `authenticateRequest(request)` | Verify any logged-in user | `Authorization: Bearer <jwt>` |
| `requireTutor(request)` | Authenticated AND `isTutorApproved` | `Authorization: Bearer <jwt>` |
| `requireAdmin(request)` | Compares `x-admin-secret` against `ADMIN_SECRET` env var (no JWT) | `x-admin-secret: <secret>` |

All three return `NextResponse` on failure — early-return when `result instanceof NextResponse`.

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
| `/api/payments/create-intent` | POST | ✓ | Create payment intent + Wompi reference |
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
| `/api/attachments/presigned-urls` | POST | ✓ | Batch presigned PUT URLs for S3 uploads (PDFs/images/docs) |
| `/api/sessions/[id]/attachments` | GET | ✓ | Presigned download URLs (access enforced server-side: student creator, or assigned tutor on Pending/Accepted sessions) |

Backed by `session-attachment.service.js` + `session-attachment.repository.js`.

### Admin (`/api/admin/`) — `x-admin-secret` header required

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
| `/api/users/[id]/reviews` | GET | Reviews received by user |
| `/api/users/[id]/reviews/stats` | GET | Avg score + count |
| `/api/users/tutors` | GET | List approved tutors |
| `/api/tutors/[id]` | GET | Single tutor (public profile) |
| `/api/schedules/me` | GET/PUT | My schedule preferences |
| `/api/sessions/stats` | GET | Aggregated session stats |
| `/api/availabilities/sync-from-calendar` | POST | Pull availability from Google Calendar |
| `/api/auth/google` | GET | Google OAuth entry |
| `/api/courses` | GET | All courses |
| `/api/courses/[id]` | GET | Single course |
| `/api/majors` | GET | Available majors (enum values) |
| `/api/majors/[id]` | GET | Single major |

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

Two flows:
- **Profile picture**: Frontend requests presigned PUT URL → uploads directly to S3 → saves URL in `profile_picture_url` via `PUT /api/users/:id`.
- **Session attachments**: Frontend hits `POST /api/attachments/presigned-urls` (batch) → uploads → service records keys against the session. Downloads served via short-lived presigned GETs from `/api/sessions/[id]/attachments`.

### Wompi (Payments)
Colombian payments processor. Service: `src/lib/services/wompi.service.js`.

Env vars: `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET`

Flow: Student calls `/api/payments/create-intent` → frontend renders Wompi widget with the returned reference → on completion Wompi calls `/api/payments/webhook` (HMAC-verified against `WOMPI_INTEGRITY_SECRET`) → service updates payment + linked session status, then triggers downstream notifications.

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

## Related Documentation

- [AGENT.md](AGENT.md) — Comprehensive developer and AI assistant guide
- [API_ENDPOINTS.md](API_ENDPOINTS.md) — API reference
- [MONOLITH_ARCHITECTURE.md](MONOLITH_ARCHITECTURE.md) — Architecture details
- [MIGRATION_PLAN.md](MIGRATION_PLAN.md) — Firebase → PostgreSQL migration notes
