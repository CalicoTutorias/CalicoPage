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

**Who is listed (visibility rule):** every student-facing tutor list (by subject, by name, joint availability) and the "N tutores disponibles" counter on course cards only include tutors that are approved, active **and have at least 3 free hours in the next 7 days** (`MIN_LISTING_HOURS`; "free" = published blocks minus already-booked sessions). A tutor with no schedule, or with under the minimum, is hidden — there would be nothing to book. The same rule drives the "Avísame" flow (§2.1 course cards without visible tutors). Direct links to a tutor profile keep working.

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

### 2.7 Discount Coupons

On the booking page the student can enter a coupon code before paying (card "Pago Seguro con Wompi").

1. "Aplicar" calls `POST /api/payments/validate-coupon` → the server recomputes the list price (course price × hours) and returns the preview: **Antes / Ahora / Ahorras**. Nothing is reserved yet.
2. "Pagar" sends only the `couponCode` to `create-intent`. The server validates again, **reserves one use** (a `RESERVED` redemption keyed by the payment reference, row-locked so two students cannot take the last slot), signs the discounted total for Wompi and freezes the pricing snapshot in the intent.
3. When Wompi approves, the payment row stores `originalAmount`, `discountAmount`, `amount` (charged) and `tutorPayoutBase`; the redemption becomes `APPROVED` and is linked to the payment and the session — that is the per-user traceability the admin sees.
4. A declined payment releases the hold. An abandoned checkout stops holding the slot after 30 minutes on its own. A payment that arrives for an expired or released hold (a slow bank, or a student who minted several discounted intents) is honoured **only if the coupon's limits still hold** — the check re-runs under the coupon lock; otherwise the payment is refused, not booked, and flagged in Sentry for a manual refund (`COUPON_LIMIT_EXCEEDED`). One intent produces at most one payment (`INTENT_CONSUMED`).
5. If the coupon stops being valid between the preview and the payment (last slot taken, expired…), `create-intent` answers `409 COUPON_*`, the form drops the coupon and explains why.

Rules (enforced server-side, see `src/lib/services/coupon.service.js`):
- Code: 3–24 chars, letters/digits/`-`/`_`, case-insensitive (stored uppercase).
- Type: `PERCENT` (1–99 %) or `FIXED` (1 000–1 000 000 COP). The discount is capped so the charge never drops below **1 500 COP** (Wompi minimum); 100 % coupons do not exist.
- Limits: optional validity window (`validFrom` / `validUntil`), optional total uses (`maxRedemptions`, counting approved uses + active holds), uses per user (default 1), optional "first session only" (no prior paid/pending payment).
- Who absorbs the discount — **two coupon types**:
  - `CALICO`: the tutor still receives 85 % of the **list price**; the whole discount comes out of Calico's commission.
  - `SHARED`: the tutor agreed to take part and receives 85 % of the **discounted amount**.
- Unknown, deleted and inactive codes all answer "no válido" (the checkout cannot probe disabled codes). Expired / exhausted / already used are distinguished because those codes are shared publicly.
- A cancelled session does not release the use in this version (see backlog).

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

**Visibility warning.** A tutor is only listed to students with at least 3 free hours in the next 7 days (see §2.1). While hidden, the tutor sees a large red alert "Tu perfil no aparece para los estudiantes" at the top of every `/tutor/*` page (except the availability page itself) and at the top of their profile (`/home/profile`, in both student and tutor mode). The alert says why (no schedule published, or "only X h free, minimum is 3 h") and links to the availability page. It disappears as soon as the saved schedule reaches the minimum. Between 3 h and the recommended 10 h a thinner amber bar nudges the tutor to publish more.

### 3.4 Google Calendar Integration

Two distinct integrations exist and run in parallel. They are independent — one does not require the other.

---

**A. Calico central calendar (automatic — no tutor action needed)**

Calico operates its own Google Calendar via a long-lived admin OAuth token (`GOOGLE_ADMIN_REFRESH_TOKEN`). This is always active regardless of whether the tutor has connected their personal calendar.

- When a session is **accepted**: Calico creates an event on its central calendar. Both tutor and student receive a Google Calendar invite by email. A Google Meet link is auto-generated and included. A 30-minute popup reminder is set.
- When a session is **cancelled**: Calico patches the event status to `cancelled`, prepending `[CANCELADA]` to the title. The event is kept in calendar history — it is not hard-deleted.

Event content:
- Title: course name and session context (set at booking time)
- Attendees: tutor email + student's `meetEmail`
- Timezone: `America/Bogota`
- Guests can see other guests; guests cannot modify the event
- Invitations (`sendUpdates`) are **not** auto-sent by the Calendar API — attendees receive Calico's Brevo email instead

**Important caveat:** The admin refresh token only stays valid long-term while the OAuth consent screen is published in "In production" mode. In "Testing" mode Google expires it after ~7 days, requiring manual regeneration via the OAuth Playground.

---

**B. Tutor personal calendar sync (opt-in)**

Tutors can optionally connect their personal Google account so Calico can read their existing calendar events as availability blocks.

**Setup flow:**
1. Tutor clicks "Conectar Google Calendar" on the Disponibilidad page
2. Google OAuth consent screen opens (users may see "Google hasn't verified this app" — expected during verification; click "Continuar" to proceed)
3. On return: connection status updates automatically; tokens stored in secure httpOnly cookies. The "Configura tu Google Calendar" picker opens: the tutor chooses **which calendar** to sync from and **what their events mean** (see modes below). Saving the picker runs a sync immediately.
4. Afterwards the tutor clicks "Sincronizar calendario" whenever their Google Calendar changes (there is no background sync)

**Which calendar is read:** the one selected in the picker (`schedules.calendarSyncId`). If none is selected, Calico looks for a calendar named `disponibilidad` (case-insensitive) and otherwise falls back to the primary calendar. Only the next 60 days are read, and only event **times** — titles, descriptions and other metadata are never stored. Events are read in the tutor's timezone (`schedules.timezone`).

**Sync modes (`schedules.calendarSyncMode`):**

- **`available` — "Mis eventos = estoy disponible"** (default). Every event in the selected calendar is imported as an availability block (recurring event instances become one weekly block; single events become one-time blocks on their date). Manual blocks stay as they are and are published alongside.
- **`busy` — "Mis eventos = estoy ocupado"**. The tutor's **manual blocks are the base** (working hours). The sync subtracts the Google events from that base for each of the next 60 days and stores the remaining free time as one-time `calendar_sync` blocks. **The base is not published on its own**: students, booking validation, joint availability and the admin availability status only see the computed blocks. Consequences:
  - Without manual blocks the sync publishes nothing and the UI shows a warning ("agrega tus horas base").
  - Creating, editing or deleting a manual block re-runs the sync automatically so the published availability follows the new base.
  - Free remainders are snapped to the slot rules (start/end on an allowed minute mark, at least 1 h); shorter gaps are dropped.
  - Events marked "Free" in Google (`transparency: transparent`) and invitations the tutor declined are ignored; all-day events block the whole day; events crossing midnight block both days.
  - In the tutor's grid the base is drawn hatched grey with a "Base" badge and the computed blocks are drawn on top with a "Google" badge (read-only: change the base or the calendar instead).
  - Disconnecting Google Calendar resets the mode to `available` so the manual blocks become visible again.

**What sync does:**
- Reads the events of the selected calendar
- Atomically replaces the tutor's `calendar_sync` blocks; manual blocks are never touched
- Returns: new blocks added, blocks removed, unchanged blocks, total, mode, and (busy mode) how many base blocks were used

**Error states handled in the UI (inline, no browser alerts):**
- `CALENDAR_NOT_FOUND`: shown inline — tutor is told to create a calendar named "disponibilidad"
- Token expired: non-blocking banner with "Reconectar" CTA replaces popup confirms
- OAuth denied / callback failure: redirect to `/calendar-error` with error details

**Fallback (no Google Calendar):**
Tutors who do not connect their calendar add blocks manually via "Agregar horario". Both methods are fully supported and independent.

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
- Earnings = 85% of the tutor payout base (the list price, or the discounted amount when the student used a coupon the tutor agreed to share; Wompi fees deducted from Calico's share). Payments with a shared coupon are flagged in the transaction history
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
- Availability traffic light per tutor (free hours in the next 7 days) plus a red "No visible para estudiantes" badge on tutors under the 3-hour listing minimum, and the date of the last schedule reminder sent
- **Schedule reminder (bulk):** "Recordar horario a N tutores ocultos" → confirmation → sends every hidden active tutor an email (Brevo template 16) and an in-app notification asking them to publish availability. Tutors reminded in the last 3 days are skipped; the result shows sent / skipped / failed
- View tutor detail: profile, per-subject status, rating, session count
- **Schedule reminder (single):** on a hidden tutor's detail page, "Enviar recordatorio por correo" sends the same email + notification to that tutor, with no cooldown
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

### 4.6 Coupons (`/home/admin/coupons`)

Sidebar group "Finanzas y operación". Admins can:
- **List** coupons with filters by computed status (active, scheduled, inactive, expired, exhausted, deleted) and search by code. Each row shows discount, who absorbs it, validity, uses vs limit (plus active holds), and the cost of the discount split between Calico and tutors.
- **Create / edit** (same form): code, description, type and value, who absorbs, usage limit, uses per user, first-session-only, validity window, active flag. A live example on a 60 000 COP session shows the discount, what the student pays, what the tutor receives and what is left for Calico — and warns when Calico would go negative. The code is locked once the coupon has uses.
- **Activate / deactivate** without losing history.
- **Delete**: soft-delete when the coupon has uses (history kept, hidden from the default list), hard-delete otherwise.
- **See uses** ("Ver usos"): every redemption with user, date, status (approved / reserved / hold expired / released), session, list price, discount, paid amount and who absorbed it.

Every mutation is written to the audit log (`COUPON_CREATE` / `COUPON_UPDATE` with before-after / `COUPON_DELETE`).

The revenue dashboard, the payouts page, the profitability table and the user detail expose the discounts alongside the charged volume; tutor payouts are always computed on the tutor payout base.

---

## 5. Notifications

In-app notification bell (header). Types:
- New session request (tutor)
- Session confirmed / canceled (both parties)
- Reminders
- Schedule reminder "Publica tu horario" (tutor) — created only when an admin sends the availability reminder and the email went out; clicking it opens the availability page. Its timestamp is what the admin panel shows as "last reminder sent". The text names the address the email went to and where to look for it: Gmail users are told to check the **Promociones** tab (where these HTML emails usually land, without a push notification); everyone else is told to check Promociones or Spam

Notification center: mark individual or all as read.

---

## 6. Business Rules Summary

| Rule | Detail |
|---|---|
| Email verification gate | No JWT issued before email verified; login returns 403 if not verified |
| Tutor approval granularity | Per-subject — a tutor can be approved for some courses and not others |
| Tutor visibility | Students only see tutors with ≥ 3 free hours (`MIN_LISTING_HOURS`) in the next 7 days; the same rule drives course "tutores disponibles" counters and the "Avísame" flow. Hidden tutors see a red alert in their zone and profile |
| Schedule reminder | Admins can email hidden tutors (Brevo template 16 + in-app notification); bulk sends skip anyone reminded in the last 3 days, single sends don't; every send is audited as `TUTOR_AVAILABILITY_REMINDER` |
| Pricing authority | Calico sets all prices; tutors cannot override |
| Server-authoritative amount | Client-submitted `amount` is always ignored on payment creation |
| Coupons are server-side only | The client sends a code; discount, final amount and tutor payout base are computed, reserved and signed on the server, then reconciled against the stored intent snapshot on confirmation |
| Minimum charge | A coupon never drops the charge below 1 500 COP (Wompi minimum); no 100 % coupons |
| Who absorbs a discount | `CALICO` coupons keep the tutor at 85 % of the list price; `SHARED` coupons pay the tutor 85 % of the discounted amount |
| Payment status | Wompi payments are `paid` from creation (transaction verified APPROVED with the private key); `pending` only for manual sessions awaiting payment |
| Cancellation window | 6 hours before session start |
| Auto-calendar on accept | Google Calendar event + Meet link created on session accept, deleted on cancel |
| Wompi webhook integrity | HMAC against `WOMPI_INTEGRITY_SECRET` verified before any state mutation |
| Admin role freshness | Admin role is read from DB on every request — not from JWT |
| Audit log immutability | Admin actions are insert-only in `admin_audit_log` |
| Identity source | Always `auth.sub` from verified JWT — never from request body/URL |
