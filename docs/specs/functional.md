# Calico — Functional Specification

Describes what the system does from a user perspective: flows, rules, and edge cases. For how it is built see [technical.md](technical.md).

---

## 1. Authentication & Registration

### 1.1 Registration

1. User fills: full name, email, password (min 6 chars, 1 uppercase, 1 special char), confirm password, phone (with country code), career (from dropdown)
2. User accepts Terms & Conditions and Privacy Policy
3. System creates account, sends verification email via Brevo
4. **No JWT is issued at registration** — email must be verified before login is possible

### 1.2 Email Verification

- User opens verification email and clicks the link
- System marks `isEmailVerified = true`
- If email does not arrive: user can request a resend from the verification page
- Until verified, login is blocked with `EMAIL_NOT_VERIFIED` (403)

### 1.3 Login

- Email + password, or "Continue with Google" (OAuth)
- On success: JWT issued, stored in `localStorage` as `calico_auth_token`
- On failure: wrong credentials → 401; unverified email → 403

### 1.4 Password Recovery

1. "Forgot password?" → enter email
2. System sends reset link via Brevo
3. User follows link → sets new password

### 1.5 Role Toggle (Student ↔ Tutor)

Approved tutors can switch between student view and tutor view from their profile page. The role toggle does not affect auth — it's a UI navigation state. Both roles share one account.

---

## 2. Student Flows

### 2.1 Tutor Discovery

**By subject:**
- Browse course cards (name, department, complexity, base price, number of tutors)
- Click "Buscar Tutor" on a course → filtered tutor list for that course
- Each tutor card shows: name, rating, price/hour, next available slot

**By name:**
- Search bar across all tutors

**Joint availability view:**
- "Ver Disponibilidad Conjunta" button — compare multiple tutors' free slots side by side

### 2.2 Booking a Session

1. Select a time slot from a tutor's available blocks
2. Review summary: subject, tutor, date, time, base price, platform commission
3. Enter Google Meet email (the session link will be sent here)
4. Upload payment proof (JPG/PNG/PDF, max 5 MB) — applies to manual transfer flows
5. Click "Confirmar Reserva" → session created in `Pending` state
6. Success modal shows Google Meet link, session details

Payment flow (Wompi):
- Frontend shows the server-computed price (fetched from `/api/courses/[id]`, computed with `computeSessionAmount`)
- Wompi widget initializes with server-signed `amountInCents`
- On Wompi completion, webhook fires → session moves to `Pending` (awaiting tutor acceptance)

### 2.3 Session Attachments

Students can attach study materials to a session in two moments:
- **At booking time**: upload during the booking flow (PDF/PNG/JPG/DOC/DOCX, max 10 MB per file, max 5 per session)
- **After booking, from history**: add more files from `/home/history` on `Pending` or `Accepted` sessions

Downloads are secured: only the session's student and the assigned tutor can access download links.

### 2.4 Session History

History page tabs: **Próximas** (upcoming), **Pasadas** (past), **Todas**, **Canceladas**

Each row shows: date, subject, tutor, status badge.
Available actions per row:
- **Ver detalles** — always
- **Calificar tutor** — on `Completed` sessions where review not yet submitted
- **Ver calificación** — on `Completed` sessions where review was submitted
- **Cancelar / Reprogramar** — on `Pending` / `Accepted` sessions (subject to cancellation policy)

### 2.5 Rating a Tutor

- Available once session status is `Completed`
- 1–5 stars + optional text comment
- Bidirectional: tutor also rates the student

### 2.6 Favourites

Students can save tutors to a favourites list for quick access.

---

## 3. Tutor Flows

### 3.1 Tutor Application

Triggered from student profile page ("¿Quieres ser tutor?") or directly via `/tutor-application`.

Pre-application screen shows commitments (response time < 24h, subject mastery, professional conduct, approval process). User must confirm to proceed.

Form fields:
- Motivation (free text)
- Subjects to teach (grid selector, minimum 1)
- WhatsApp number (with country code)
- Bre-B key (for receiving payments)

On submit: Calico team receives an email with the applicant's user ID and requested subject IDs. Application status shown on profile as "Solicitud en revisión".

### 3.2 Approval Process

See [PROJECT.md](../PROJECT.md) — Tutor Subject Approval section.

For tutors already approved via direct interview: they can notify Calico and be assigned directly without re-interviewing.

### 3.3 Managing Availability

Main page: week view (left) + pending/upcoming requests (right).

**Block types:**
- **Green blocks** — weekly recurring availability
- **Blue blocks** — one-off exceptions for a specific week

Per block: day of week, start time, end time (end must be after start). Blocks can be deleted at any time.

Students can only book within published availability blocks. Tutors should keep availability updated.

### 3.4 Google Calendar Sync

Button: "Conectar Google Calendar" (or "Sincronizar calendario" if already connected).

On connect:
- OAuth consent → read-only access to the next 60 days
- System reads events only from the calendar named **`disponibilidad`**
- Events in that calendar are treated as tutor's free time slots

Google verification warning: the app may show "Google hasn't verified this app" — this is expected during the verification process. Users can proceed by clicking "Continue".

When a session is **accepted**: Calico auto-creates a Google Calendar event with the Meet link and invites both student and tutor.
When a session is **canceled**: the calendar event is deleted.

Privacy: only event times are read. Event titles/content are not stored.

### 3.5 Managing Subjects

From `/tutor/materias`:
- Request new subjects (same review process as initial application, labeled "Tutor Existente")
- Tabs: **Todas**, **Aprobadas**, **En revisión**, **Rechazadas**
- Each approved subject card shows base price and Calico commission

### 3.6 Accepting / Canceling Sessions

Pending requests appear in the availability page sidebar.

- **Cancel** — available up to 6 hours before the session
- Tutor receives session requests; there is no separate "accept" action in the current UI (auto-accept is configurable via `Schedule.autoAcceptSession`)

### 3.7 Payments & Statistics

`/tutor/pagos` shows:
- Total sessions, next payout, average rating, sessions this month
- Transaction history filterable by subject and date range
- Earnings = 85% of session gross price (Wompi fees deducted from Calico's 15%)
- Payout to Bre-B key on withdrawal request

---

## 4. Admin Flows

### 4.1 Tutor Moderation

**Pending applications** (`/home/admin/tutors` → Pendientes tab):
- View applicant profile: motivation, requested subjects, contact info
- Checkboxes to select which subjects to approve (all pre-selected by default)
- Approve: selected subjects → `Approved`, rest → `Rejected` automatically
- Reject: requires written reason

**Active tutors** (Activos tab):
- Search by name/email
- View tutor detail: profile, per-subject status, rating, session count
- Suspend: requires reason → sets `isActive = false`, cancels all future sessions

**Suspended tutors** (Suspendidos tab):
- Reinstate: reactivates tutor

All actions create a row in `admin_audit_log` with admin ID, action, target, payload, and IP.

### 4.2 Dashboard Metrics (`/home/admin/dashboard`)

KPIs (refreshed on demand or with 5-min TTL cache):
- Sessions this week (completed)
- Calico net revenue this month
- Active tutors (last 30 days)
- Pending applications

Charts:
- Session series (12 weeks): completed / canceled / upcoming
- Revenue series (12 months): gross

Rankings (7d / 30d / 90d selector):
- Top courses by sessions
- Top tutors by completed sessions + rating

### 4.3 Growth Analytics (`/home/admin/growth`)

**Repeat-purchase metrics** (segmentable by career):
- Overall re-purchase rate
- Same-tutor re-purchase rate
- Median days between sessions
- Average ticket: recurring vs new students

**Retention cohorts** (by first-session month, 12 months):
- % of students who returned within 30 / 60 / 90 days

**Course profitability** (segmentable by department):
- Gross revenue, Calico net, net per session, margin
- Red flag: courses where price < break-even (~$7,032 COP)

**Active users by last-seen** (7-day window):
- Active tutors count
- Active students count
- Powered by `User.lastSeenAt` — updated on login and on every `/api/auth/me` heartbeat (throttled 30 min)

Each metric has a tooltip explaining what it measures, how it is calculated, and actionable thresholds.

### 4.4 User Directory (`/home/admin/users`)

Tabs: Todos / Estudiantes / Tutores / Admins / Suspendidos. Searchable by name or email.

User profile shows:
- Identity: email, phone, career, Bre-B key (if tutor), join date
- Student KPIs: sessions attended, subjects, unique tutors, avg rating received
- Tutor KPIs: sessions given, subjects taught, avg rating, gross earned, Calico's cut, tutor payout
- Monthly activity chart
- Recent sessions (last 10)

Sensitive fields (`passwordHash`, `verificationToken`, `resetToken`, `otpCode`) are never exposed.

### 4.5 Audit Log (`/home/admin/audit`)

Paginated table (25/page) of all admin actions. Filterable by action type and date range.

Columns: date, admin, action (color-coded by type), target, payload preview, IP.

The log is **immutable** — no UPDATE or DELETE is permitted on `admin_audit_log`.

---

## 5. Notifications

In-app notification bell (header). Types:
- New session request (tutor)
- Session confirmed / canceled (both parties)
- Reminders

Notification center: mark individual or all as read.

---

## 6. Business Rules Summary

| Rule | Detail |
|---|---|
| Email verification gate | No JWT issued before email verified; login returns 403 if not verified |
| Tutor approval granularity | Per-subject — a tutor can be approved for some courses and not others |
| Pricing authority | Calico sets all prices; tutors cannot override |
| Server-authoritative amount | Client-submitted `amount` is always ignored on payment creation |
| Cancellation window | 6 hours before session start |
| Auto-calendar on accept | Google Calendar event + Meet link created on session accept, deleted on cancel |
| Wompi webhook integrity | HMAC against `WOMPI_INTEGRITY_SECRET` verified before any state mutation |
| Admin role freshness | Admin role is read from DB on every request — not from JWT |
| Audit log immutability | Admin actions are insert-only in `admin_audit_log` |
| Identity source | Always `auth.sub` from verified JWT — never from request body/URL |
