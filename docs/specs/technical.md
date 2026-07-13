# Calico — Technical Specification

Full reference for the database schema, API routes, environment variables, and external services. For conventions and patterns see [../PATTERNS.md](../PATTERNS.md).

---

## Database Schema (PostgreSQL + Prisma)

Schema source: `prisma/schema.prisma`. Generated client: `src/generated/prisma/`.

### Tables

| Table | PK type | Description |
|---|---|---|
| `users` | UUID | Core user — auth, profile, role |
| `tutor_profiles` | UUID (userId) | Tutor-specific data (1:1 with user) |
| `tutor_applications` | UUID | Application to become a tutor |
| `tutor_courses` | composite (tutorId, courseId) | Many-to-many tutor ↔ course with per-course status and custom price |
| `departments` | UUID | Academic departments |
| `careers` | UUID | Academic careers (FK to department) |
| `courses` | UUID | Academic courses with complexity + base price; `career_id` FK to `careers` (`NOT NULL`, indexed) |
| `topics` | UUID | Course subtopics |
| `course_prices` | UUID | Admin-set override prices per course |
| `schedules` | UUID | Tutor schedule preferences (1:1 with user) |
| `availabilities` | UUID | Weekly recurring time blocks per tutor |
| `sessions` | UUID | Tutoring session (Individual or Group) |
| `session_participants` | composite (sessionId, studentId) | Students enrolled in a session |
| `session_attachments` | UUID | Files attached to a session |
| `payments` | UUID | Payment record per session |
| `reviews` | UUID | Bidirectional rating per session |
| `notifications` | UUID | In-app notifications |
| `admin_audit_log` | UUID | Immutable log of all admin mutations |

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

> Majors/careers are **not** an enum. They are the `Department` + `Career` tables (UUID PKs). `User.careerId` is a UUID FK. The legacy `MajorEnum` was removed in the Firebase → PostgreSQL migration. `Course.careerId` is also a UUID FK to `Career` (every course belongs to exactly one career, matched from its `code` prefix — see migration `20260621000000_add_course_career_relation`).

### Key Fields

| Field | Table | Description |
|---|---|---|
| `role` | `users` | `STUDENT` or `ADMIN`. Read fresh from DB by `requireAdminUser` on every request — never trusted from JWT |
| `isTutorRequested` | `users` | User submitted a tutor application |
| `isTutorApproved` | `users` | User has at least one approved tutor subject |
| `isEmailVerified` | `users` | Hard login gate — JWT not issued until `true` |
| `isActive` | `users` | `false` = suspended. Checked by `requireAdminUser` |
| `lastSeenAt` | `users` | Last time user was in the app. Updated on login + `/api/auth/me` heartbeat (throttled 30 min). Powers admin "active users" metric |
| `suspendedAt` / `suspendedReason` | `users` | Set when admin suspends a tutor |
| `autoAcceptSession` | `schedules` | If `true`, incoming session requests are auto-accepted |
| `bufferTime` | `schedules` | Minutes between sessions (default 15) |
| `dayOfWeek` | `availabilities` | 0 (Sunday) to 6 (Saturday) |
| `maxCapacity` | `sessions` | 1 for Individual, 2–20 for Group |
| `cancellationReason` | `sessions` | e.g. `TUTOR_SUSPENDED` for bulk cancellations |
| `status` | `tutor_courses` | `Pending / Approved / Rejected` per subject |

### Sensitive Fields (never expose in API responses)

`passwordHash`, `verificationToken`, `resetToken`, `otpCode`, `studentRating`

All repositories sanitize these. The `select` in admin user queries uses an explicit allow-list.

---

## API Routes

All protected routes require `Authorization: Bearer <token>`.

### Auth (`/api/auth/`)

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/auth/register` | POST | — | Create account + send verification email. No JWT issued |
| `/api/auth/login` | POST | — | Email + password → JWT. Rejects if `!isEmailVerified` |
| `/api/auth/me` | GET | ✓ | Validate token, return user profile. Refreshes `lastSeenAt` (throttled 30 min) |
| `/api/auth/verify-email` | POST | — | Validate token → mark verified (requires explicit user click) |
| `/api/auth/verify-email` | GET | — | No-op redirect to `/auth/confirm-email?token=` (scanner-safe; legacy email links) |
| `/api/auth/resend-verification` | POST | — | Resend verification email |
| `/api/auth/forgot-password` | POST | — | Send password reset link via Brevo |
| `/api/auth/reset-password` | POST | — | Validate reset token → set new password |
| `/api/auth/check-verification` | GET | — | Check if email is verified |
| `/api/auth/change-password` | POST | ✓ | Change password (authenticated) |
| `/api/auth/verify-otp` | POST | — | OTP verification |
| `/api/auth/google` | POST | — | Verify Google ID token → create/link user → JWT |

### Sessions (`/api/sessions/`)

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/sessions` | POST | ✓ | Create session (student books tutor) |
| `/api/sessions` | GET | ✓ | My sessions (tutor or student view) |
| `/api/sessions/stats` | GET | ✓ | Aggregated session stats |
| `/api/sessions/[id]` | GET | ✓ | Session details + reviews |
| `/api/sessions/[id]/accept` | PUT | ✓ tutor | Accept → create Google Calendar event |
| `/api/sessions/[id]/reject` | PUT | ✓ tutor | Reject session |
| `/api/sessions/[id]/complete` | PUT | ✓ tutor | Mark completed (enables reviews) |
| `/api/sessions/[id]/cancel` | PUT | ✓ | Cancel → delete Google Calendar event |
| `/api/sessions/[id]/join` | POST | ✓ | Join group session |
| `/api/sessions/[id]/reviews` | POST | ✓ | Create/update review |

### Session Attachments

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/attachments/presigned-urls` | POST | ✓ | Batch presigned PUT URLs (subject-scoped). Used at **booking time** |
| `/api/sessions/[id]/attachments/upload-urls` | POST | ✓ | Session-scoped presigned PUT URLs. Used to add files **from history** |
| `/api/sessions/[id]/attachments/register` | POST | ✓ | Persist DB rows for uploaded files |
| `/api/sessions/[id]/attachments` | GET | ✓ | Presigned download URLs (access enforced: student creator or assigned tutor on Pending/Accepted) |

Max 5 files per session, ≤10 MB each, types: PDF/PNG/JPG/DOC/DOCX.

### Availabilities (`/api/availabilities/`)

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/availabilities` | POST | ✓ tutor | Create weekly block |
| `/api/availabilities` | GET | — | List all blocks |
| `/api/availabilities/[id]` | GET/PUT/DELETE | ✓ | Single block CRUD |
| `/api/availabilities/me` | GET | ✓ | My availability blocks |
| `/api/availabilities/bulk-replace` | POST | ✓ tutor | Replace all blocks atomically |
| `/api/availabilities/sync-from-calendar` | POST | ✓ | Pull availability from Google Calendar |

### Tutor (`/api/tutor/`)

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/tutor/profile` | GET/PUT | ✓ tutor | Tutor profile CRUD |
| `/api/tutor/courses` | GET/POST | ✓ tutor | Manage courses offered |
| `/api/tutor/courses/[courseId]` | PUT/DELETE | ✓ tutor | Update/remove a course |

### Tutor Applications (`/api/tutor-applications/`)

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/tutor-applications` | POST | ✓ | Submit application (motivation, subjects, contact info, Bre-B key) |

### Notifications (`/api/notifications/`)

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/notifications` | POST | ✓ | Create notification (internal) |
| `/api/notifications/[id]` | GET/DELETE | ✓ | Single notification |
| `/api/notifications/[id]/read` | PUT | ✓ | Mark as read |
| `/api/notifications/read-all` | PUT | ✓ | Mark all as read |
| `/api/notifications/user/[userId]` | GET | ✓ | List user's notifications |
| `/api/notifications/user/[userId]/unread` | GET | ✓ | List unread |

### Payments — Wompi (`/api/payments/`)

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/payments/create-intent` | POST | ✓ | Create payment intent + Wompi reference. **Price computed server-side** — client `amount` ignored |
| `/api/payments/confirm-payment` | POST | ✓ | Confirm a completed payment |
| `/api/payments/webhook` | POST | — | Wompi webhook (HMAC-verified before any mutation) |
| `/api/payments/test-webhook` | POST | — | Local webhook simulation |
| `/api/payments/[id]` | GET | ✓ | Payment details |
| `/api/payments/student/[email]` | GET | ✓ | Payments by student email |
| `/api/payments/tutor/[tutorId]` | GET | ✓ tutor | Payments owed/paid to a tutor |

### Admin — Tutor management (`requireAdminUser`)

| Route | Method | Description |
|---|---|---|
| `/api/admin/tutors/pending` | GET | Pending applications + user + requested subjects |
| `/api/admin/tutors` | GET | Approved tutors (`?status=active\|suspended`, `?search=`) |
| `/api/admin/tutors/[userId]` | GET | Tutor detail (profile, per-course status, latest application) |
| `/api/admin/tutors/[userId]/approve` | POST | Approve a subset of courseIds (rest → Rejected) |
| `/api/admin/tutors/[userId]/reject` | POST | Reject application (reason required) |
| `/api/admin/tutors/[userId]/suspend` | POST | Suspend + bulk-cancel future sessions |
| `/api/admin/tutors/[userId]/reinstate` | POST | Lift suspension |
| `/api/admin/tutors/[userId]/courses` | POST | Assign courses to an approved tutor |
| `/api/admin/tutors/[userId]/courses/[courseId]` | PUT | Set a single tutor↔course status |

### Admin — Metrics (`requireAdminUser`, in-process TTL 5 min cache)

| Route | Method | Description |
|---|---|---|
| `/api/admin/metrics/overview` | GET | KPI snapshot: sessions this week, Calico net this month, active tutors 30d, pending apps |
| `/api/admin/metrics/sessions?weeks=N` | GET | Weekly session series (completed / canceled / upcoming) |
| `/api/admin/metrics/revenue?months=N` | GET | Monthly revenue series (gross + exact Calico net) |
| `/api/admin/metrics/top-courses?days=N&limit=K` | GET | Most-requested courses |
| `/api/admin/metrics/active-tutors?days=N&limit=K` | GET | Top tutors by completed sessions |
| `/api/admin/metrics/retention?days=N&careerId=` | GET | Repeat-purchase KPIs + active users 7d |
| `/api/admin/metrics/retention/cohorts?months=N&careerId=` | GET | First-session cohorts (30/60/90-day return rate) |
| `/api/admin/metrics/profitability?days=N&departmentId=` | GET | Per-course Calico net, margin, net/session, break-even |

### Admin — Users directory (`requireAdminUser`)

| Route | Method | Description |
|---|---|---|
| `/api/admin/users?role=&search=` | GET | All users, searchable, role-filtered. Safe select only |
| `/api/admin/users/[userId]` | GET | Full profile: identity + activity stats + recent sessions |

### Admin — Payouts & Audit (`requireAdminUser`)

| Route | Method | Description |
|---|---|---|
| `/api/admin/payouts?view=` | GET | Tutor payouts owed (`byTutor` digest / flat) |
| `/api/admin/payouts/[paymentId]/mark-paid` | POST | Mark one payout transferred |
| `/api/admin/payouts/bulk-mark-paid` | POST | Mark many payouts transferred |
| `/api/admin/audit` | GET | Paginated audit log (filters: action, adminId, targetType, from, to) |

### Admin — Legacy (`requireAdmin` / `x-admin-secret`)

| Route | Method | Description |
|---|---|---|
| `/api/admin/course-prices` | GET/POST | List or upsert course base prices |
| `/api/admin/course-prices/[courseId]` | DELETE | Remove course price |
| `/api/admin/tutor-courses` | GET/POST | Manage tutor↔course assignments |
| `/api/admin/tutor-courses/[tutorId]/[courseId]` | PUT/DELETE | Update/remove a single tutor↔course |

### Users & Schedules

| Route | Method | Description |
|---|---|---|
| `/api/users/[id]` | GET/PUT | User profile |
| `/api/users/me/profile-picture` | PATCH/DELETE | Confirm a freshly-uploaded avatar / remove current avatar |
| `/api/users/me/profile-picture/presigned-url` | POST | Get presigned PUT URL for avatar upload |
| `/api/users/[id]/reviews` | GET | Reviews received by user |
| `/api/users/[id]/reviews/stats` | GET | Avg score + count |
| `/api/users/tutors` | GET | List approved tutors |
| `/api/tutors/[id]` | GET | Single tutor public profile |
| `/api/schedules/me` | GET/PUT | My schedule preferences |
| `/api/courses` | GET | All courses |
| `/api/courses/[id]` | GET | Single course |
| `/api/majors` | GET | All careers + their department |
| `/api/majors/[id]` | GET | Single career |

### Google Calendar (`/api/calendar/`, `/api/calico-calendar/`)

Two separate auth mechanisms serve different purposes.

**1. Tutor personal OAuth** (`/api/calendar/`)

| Route | Method | Description |
|---|---|---|
| `/api/calendar/auth-url` | GET | Generate OAuth URL with CSRF state cookie |
| `/api/calendar/callback` | GET | Exchange code for tokens; set httpOnly cookies; redirect to `/tutor/disponibilidad?calendar_connected=true` |
| `/api/calendar/check-connection` | GET | Probe `calendarList.list`; returns `{ connected, tokenValid, hasAccessToken }` |
| `/api/calendar/refresh-token` | POST | Force refresh the access token |
| `/api/calendar/disconnect` | POST | Revoke token + clear cookies |
| `/api/calendar/list` | GET | List all calendars on the tutor's account |
| `/api/calendar/events` | GET | List events from a specific calendar |
| `/api/calendar/create-event` | POST | Create event on the tutor's calendar |
| `/api/calendar/delete-event` | DELETE | Delete event from tutor's calendar |
| `/api/calendar/diagnostics` | GET | Full diagnostic — connection, calendars, recent events |
| `/api/availabilities/sync-from-calendar` | POST | ✓ tutor | Find `disponibilidad` calendar, bulk-replace availability blocks |

Scopes requested: `calendar.events` (create/update/delete) + `calendar.readonly` (list calendars and events).

Token storage (httpOnly cookies):
- `calendar_access_token` — 1-hour TTL; validated on every calendar API call
- `calendar_refresh_token` — 30-day TTL; used by `getAccessTokenOrRefresh()` to silently renew the access token on 401
- `calendar_oauth_state` — short-lived CSRF token; cleared after callback

Service: `src/lib/services/calendar.service.js`

**2. Calico service account** (`/api/calico-calendar/`)

| Route | Method | Description |
|---|---|---|
| `/api/calico-calendar/tutoring-session` | POST | Create event on Calico's central calendar |
| `/api/calico-calendar/tutoring-session/[eventId]` | PUT | Update an existing session event |
| `/api/calico-calendar/tutoring-session/[eventId]/cancel` | POST | Patch event to `cancelled` status (keeps history) |
| `/api/calico-calendar/status` | GET | Verify the admin token is live (`verifyConnection()`) |

Auth: `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `GOOGLE_ADMIN_REFRESH_TOKEN`. The googleapis client auto-refreshes the short-lived access token from the refresh token on every call.

Service: `src/lib/services/calico-calendar.service.js`. Singleton — initialized on module import; `auth` is module-level cached.

**Session event spec** (created by Calico service account on session accept):
- `summary`: set by booking flow (course name)
- `description`: tutor name, student name, context note
- `attendees`: tutor email (`responseStatus: accepted`) + student `meetEmail`
- `conferenceData`: `hangoutsMeet` with `accessType: ANYONE` — Meet link auto-generated; falls back to event-without-Meet if Meet creation fails
- `reminders`: popup 30 min before
- `guestsCanModify: false`, `guestsCanSeeOtherGuests: true`
- `sendUpdates: 'none'` — Calendar API does not send invites; Brevo handles notifications
- Timezone: `America/Bogota`

On cancel: `events.patch` sets `status: 'cancelled'` and prepends `[CANCELADA]` to summary. Full `events.delete` is also available but not called in the standard cancel flow.

**Env vars:**
```
GOOGLE_CLIENT_ID          # Shared by both integrations
GOOGLE_CLIENT_SECRET      # Shared by both integrations
GOOGLE_REDIRECT_URI       # Tutor OAuth callback URL
GOOGLE_ADMIN_REFRESH_TOKEN # Service account long-lived token
CALICO_CALENDAR_ID        # ID of Calico's central calendar
GDRIVE_PAYMENT_FOLDER_ID  # Google Drive folder for payment receipts
```

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

# Google Calendar / OAuth
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

# Admin (used by legacy /api/admin/* via x-admin-secret header)
ADMIN_SECRET=
```

---

## External Services

### Brevo (Email)

REST API v3 (`https://api.sendinblue.com/v3/smtp/email`). Service: `src/lib/services/email.service.js`.

Single source of truth for template IDs is the `TEMPLATE_IDS` constant in that file:

| ID | Template | Trigger |
|---|---|---|
| 2 | Email verification | Registration |
| 3 | Password changed confirmation | Change password |
| 4 | Password reset link | Forgot password |
| 5 | Tutor application — admin notification | Application submitted |
| 7 | Session confirmed | Tutor accepts session |
| 8 | New session request / session cancelled (recipient) | Booking created / session canceled |
| 9 | Session cancelled — admin notification | Session canceled |
| 10 | Course request — admin notification | Tutor requests new subject |
| 11 | Tutor application approved | Admin approves tutor ⚠️ template not yet created in Brevo dashboard |
| 12 | Tutor application rejected | Admin rejects tutor ⚠️ template not yet created in Brevo dashboard |
| 13 | Tutor suspended | Admin suspends tutor ⚠️ template not yet created in Brevo dashboard |

Templates 11/12/13 are referenced in code but missing from the Brevo dashboard — see [../BACKLOG.md](../BACKLOG.md).

### AWS S3 (File Storage)

Service: `src/lib/s3.js`. Presigned URLs for direct browser → S3 uploads.

**Profile pictures flow:**
1. Client compresses to WebP 512×512 in Canvas
2. `POST /api/users/me/profile-picture/presigned-url` → presigned PUT URL (tagged `status=unconfirmed`)
3. Browser PUTs to S3
4. `PATCH /api/users/me/profile-picture` → verifies with `headObject`, persists public URL in `users.profile_picture_url`, flips tag to `confirmed`, deletes previous picture (only if under `profile-pictures/{userId}/` prefix — never touches external OAuth avatars)

**Bucket policy required** for profile pictures (stored as public URLs used as `<img src>`):
```json
{
  "Effect": "Allow",
  "Principal": "*",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::calico-uploads/profile-pictures/*"
}
```

**Recommended:** S3 Lifecycle rule that deletes objects tagged `status=unconfirmed` after 24h (orphan cleanup for abandoned uploads).

**Session attachments flow:**
- S3 key layout: `session-attachments/{subject-slug}/{YYYY-MM}/{batchId}/{filename}`
- Two upload entry points share the same layout: booking flow uses subject-scoped URLs; history flow uses session-scoped URLs
- Both register files via `/api/sessions/[id]/attachments/register`
- Client upload goes through `useFileUpload` hook — `uploadFiles()` returns fresh metadata; **do not read `uploadedFiles` right after awaiting an upload** (stale-closure trap)

### Wompi (Payments)

Colombian payments processor. Service: `src/lib/services/wompi.service.js`.

**Flow:**
1. Student calls `/api/payments/create-intent` → server computes price → returns Wompi reference
2. Frontend renders Wompi widget with the returned reference and server-signed `amountInCents`
3. Student completes payment in widget
4. Wompi calls `/api/payments/webhook` → HMAC verified against `WOMPI_INTEGRITY_SECRET` → updates payment + session status + triggers notifications

**Pricing:**
- `src/lib/payments/session-amount.js` — `pricePerHour(course)`, `sessionDurationHours(start, end)`, `computeSessionAmount(...)` — pure functions, safe to import client-side
- `src/lib/payments/pricing.js` — `resolveSessionAmount({ courseId, start, end })` — server-side only (loads from DB)
- `src/lib/payments/fees.js` — commission split + break-even math. **Single source of truth.**

### Google Calendar

Env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_ADMIN_REFRESH_TOKEN`, `CALICO_CALENDAR_ID`, `GDRIVE_PAYMENT_FOLDER_ID`

**Initial setup after deployment:**
1. Visit `https://your-domain.com/api/calendar/auth`
2. Login with `calico.tutorias@gmail.com`
3. Grant permissions

**Behavior:**
- On session **accept**: creates Google Calendar event with Meet link, invites both parties
- On session **cancel**: deletes the calendar event
- On availability sync: reads events from the tutor's `disponibilidad` calendar (read-only, 60-day window)

---

## File Structure Reference

```
src/
├── app/
│   ├── api/              — API Route Handlers (server)
│   ├── components/       — React components (client)
│   ├── services/core/    — Frontend service singletons (client)
│   ├── hooks/            — React hooks (client)
│   ├── context/          — React context providers (client)
│   └── styles/           — design-tokens.css, globals.css
│
└── lib/
    ├── auth/             — guards.js, middleware.js, rateLimit.js
    ├── services/         — Business logic services (server)
    ├── repositories/     — Prisma query wrappers (server)
    ├── payments/         — fees.js, pricing.js, session-amount.js
    ├── i18n/             — I18nProvider, locales/es.json, locales/en.json
    ├── s3.js             — AWS S3 client
    └── prisma.js         — Prisma singleton
```
