# Events (group reviews) + post-event surveys — Design

**Date:** 2026-10-03 · **Status:** approved in conversation, pending written-spec review
**Scope:** phases 1 + 2 of the events initiative, shipped together. Phase 3 is listed at the end and is out of scope.

## 1. Context and goals

Calico runs group reviews ("repasos") that people sign up for:

- **Free repasos** (e.g. basic programming) are an acquisition channel. They bring new people onto the platform.
- **Paid repasos** cover specific courses (Systems, Chemistry, Industrial…).

Today these are run outside the product. This feature moves them into Calico. The admin configures an event, shares a public link, and people register (and pay when needed). After the event, attendees answer a short survey. The survey ratings feed the tutors' public ratings, which today have almost no data.

**Success criteria**

- An admin can create and publish a free or paid event without developer help.
- A person can open a shared link, see the event without logging in, log in or register, and end up registered (and paid) with no manual intervention.
- Concurrent checkouts never over-grant the "first X registrants get Y % off" discount.
  - The only overrun path is a payment approved after its 30-minute hold expired. That payment is honoured and flagged.
- Nobody who paid ends up without a registration.
- Every anomaly shows up in admin's anomalies list:
  - a duplicate payment, a payment for a cancelled event, or a payment for a cancelled registration → queued as a pending refund;
  - an early-bird overrun → listed for visibility only.
- Survey answers create tutor reviews that count toward the public rating.
- The feature is covered by unit, API, real-Postgres concurrency, and E2E tests. It is also validated in production with hidden events, both at price 0 and at a real low price.

## 2. Decisions (from the design conversation)

| Topic | Decision |
|---|---|
| Phasing | Events + registration + payments **and** surveys + reminders + popup ship together. Automation and segmentation come later (phase 3). |
| Identity | **A full account is required** to register. The event page is public; "Register" goes through login/register + email verification and then returns to the event. |
| Acceptance | **Open registration**: no approval and no capacity limit. |
| Tutor pay | Outside the system. Admin records manual payouts per tutor per event for traceability. |
| Modality | Virtual (auto Google Meet on the central calendar, or a pasted link) **or** in-person (free-text location). |
| Tutors | One or more approved platform tutors per event. |
| Course | **Optional** link to a catalog `Course`. |
| Discovery | Shareable link (with OG preview), public `/eventos` listing, and a student-home card. Hidden events (`isListed=false`) are reachable only by link. |
| Survey | Fixed template with minimal friction: "Did you attend?" → event stars → stars (+ optional comment) per tutor. |
| Ratings | Event survey ratings **count toward the tutor's public rating**, through `Review` rows. |
| Attendance | Self-reported in the survey's first question. |
| Tutoring popup | The "pending feedback" for 1:1 sessions is the **existing** `Review` flow. |
| Popup frequency | At most **once per day** per device, and it **never expires** until answered. |
| Pre-event email | Registration confirmation (with `.ics`) plus a manual "remind event" button in admin. No cron. |
| Early-bird discount | Configurable per paid event: the first **X** active registrants get **Y %** off. |
| Coupons | **Not** applicable to events. Early-bird is the only discount. |
| Cancellation | Same as tutoring. ≥ 6 h before start: cancel in app and a refund is queued for admin. < 6 h: cancel allowed, no automatic refund. If Calico cancels, everyone is refunded. |
| Marketing consent | Add `User.marketingOptInAt`, set by an unchecked-by-default checkbox at event registration (Colombian Ley 1581). |
| Architecture | **Approach A**: an `Event` domain with its own tables. `Session` and `Payment` are untouched. A shared **checkout contract** dispatches approved payments by kind. `Review` becomes an exclusive arc (session **or** event). |

## 3. Architecture

### 3.1 Placement

The feature follows the project's layering: Component → frontend service → `/api` route → business service → repository → Prisma. New units:

```
src/lib/repositories/event.repository.js              Event, EventTutor, EventTutorPayout
src/lib/repositories/event-registration.repository.js EventRegistration, EventPayment, locks, counters
src/lib/repositories/event-survey.repository.js       EventSurveyResponse + Review writes
src/lib/services/event.service.js                     admin CRUD, publish, cancel, public reads
src/lib/services/event-checkout.service.js            free register, paid checkout, fulfil, user cancel
src/lib/services/event-survey.service.js              submit survey, pending feedback, reminders
src/lib/payments/event-pricing.js                     pure: quote(price, earlyBird) + validation
src/lib/payments/checkout.js                          shared: reconcile approved tx + dispatch by kind
src/lib/utils/ics.js                                  pure: build an RFC 5545 VEVENT
src/app/services/core/EventService.js                 browser client (public + student + tutor)
src/app/services/core/AdminService.js                 + admin event calls
src/app/eventos/page.jsx, eventos/[slug]/page.jsx     public pages (server wrapper + client view)
src/app/home/admin/eventos/...                        admin pages
src/app/components/PendingFeedbackPrompt/...          home popup
src/app/components/EventSurveyModal/...               survey form
```

### 3.2 Why not reuse `Session`

A `Session` has rules an event breaks:

- exactly 1 h, inside the tutor's availability, with an overlap check;
- one tutor and a mandatory course;
- code that assumes `payments[0]` / `participants[0]`.

Its payments also feed tutor payouts (85 %). Keeping events separate means a bug in events cannot corrupt tutoring bookings, payouts, or revenue metrics.

### 3.3 Shared checkout contract

Every purchasable kind follows the same contract:

```
quote(product, user)           → { listPrice, discountAmount, finalAmount }   (frozen)
PaymentIntent { reference, kind, metadata(frozen quote + kind-specific ids) }  (persisted, mandatory)
approved Wompi tx → reconcileApprovedTransaction(tx)
                      1. load PaymentIntent by reference
                      2. assert tx.amount_in_cents == frozen finalAmount × 100 (±1)
                      3. dispatch by intent.kind: 'session' → existing processSuccessfulPayment
                                                  'event'   → eventCheckoutService.fulfil
```

`src/app/api/payments/webhook/route.js` and `src/app/api/payments/confirm-payment/route.js` both call `reconcileApprovedTransaction`. Comparing against the frozen amount is safe because the widget's integrity signature (`sha256(reference + cents + 'COP' + secret)`) already prevents paying any amount other than the signed one.

### 3.4 Task 0: fix course-price reconciliation (in scope)

**Bug.** Both payment routes recompute the session price from the course's *current* price when the payment arrives:

- `webhook/route.js:113`
- `confirm-payment/route.js:126`

If an admin changes a course price while a student is in the Wompi checkout, the paid amount no longer matches. The route logs "amount mismatch" and returns 200, so Wompi never retries. The student is charged and no session is created.

**Fix (session kind):**

- Reconcile against the frozen `originalAmount − discountAmount` already stored in `PaymentIntent.metadata` (`wompi.service.js` `pricingSnapshot`).
- Persisting the `PaymentIntent` becomes **mandatory**: today it is best-effort at `wompi.service.js:189`. If persistence fails, the checkout fails.
- If an approved transaction has no stored intent (in-flight across the deploy), fall back to today's recompute path.

### 3.5 Task 0b: Wompi environment by key, not `NODE_ENV` (in scope)

`wompi-api.service.js:12-17` picks sandbox vs production from `NODE_ENV`. Vercel preview builds run with `NODE_ENV=production`, so a preview using test keys verifies transactions against the production API and fails.

**Fix:** pick the base URL from the private key prefix (`prv_test_` → sandbox, otherwise production). This is required for the preview-deployment QA in §9.5.

## 4. Data model (Prisma)

All additions are new tables or nullable columns, except two NOT NULL relaxations on `reviews`.

```prisma
enum EventStatusEnum            { Draft  Published  Canceled }          // "Finished" = endsAt < now
enum EventModalityEnum          { Virtual  InPerson }
enum EventRegistrationStatusEnum { PendingPayment  Confirmed  Canceled }
enum EventPaymentFlagEnum       { DUPLICATE  EVENT_CANCELED  REGISTRATION_CANCELED  EARLY_BIRD_OVERRUN }
enum EventRefundStatusEnum      { None  Pending  Refunded }
enum PaymentIntentKindEnum      { session  event }

model Event {
  id                    String            @id @default(uuid())
  slug                  String            @unique                 // from title + 4-char suffix; immutable after publish
  title                 String
  description           String
  coverImageUrl         String?           @map("cover_image_url")  // S3 prefix event-images/
  courseId              String?           @map("course_id")
  startsAt              DateTime          @map("starts_at")
  endsAt                DateTime          @map("ends_at")
  modality              EventModalityEnum
  autoMeet              Boolean           @default(false) @map("auto_meet")
  meetingUrl            String?           @map("meeting_url")     // never exposed publicly
  location              String?                                    // InPerson; public
  googleCalendarEventId String?           @map("google_calendar_event_id")
  price                 Decimal           @db.Decimal(10, 2)       // COP; 0 = free
  earlyBirdSlots        Int?              @map("early_bird_slots")   // with percent, or neither
  earlyBirdPercent      Int?              @map("early_bird_percent") // 1–99
  isListed              Boolean           @default(true) @map("is_listed")
  status                EventStatusEnum   @default(Draft)
  publishedAt           DateTime?         @map("published_at")
  canceledAt            DateTime?         @map("canceled_at")
  cancelReason          String?           @map("cancel_reason")
  lastReminderAt        DateTime?         @map("last_reminder_at")
  createdById           String?           @map("created_by_id")
  createdAt             DateTime          @default(now()) @map("created_at")
  updatedAt             DateTime          @updatedAt @map("updated_at")
  // relations: course, createdBy, tutors EventTutor[], registrations, tutorPayouts, reviews Review[]
  @@index([status, isListed, startsAt])
  @@map("events")
}

model EventTutor {
  eventId  String @map("event_id")
  tutorId  String @map("tutor_id")
  position Int    @default(0)          // display order
  @@id([eventId, tutorId])
  @@index([tutorId])
  @@map("event_tutors")
}

model EventRegistration {
  id                  String                      @id @default(uuid())
  eventId             String                      @map("event_id")
  userId              String                      @map("user_id")
  status              EventRegistrationStatusEnum
  earlyBird           Boolean                     @default(false) @map("early_bird")
  reservedAt          DateTime?                   @map("reserved_at")       // start of current checkout hold
  listPrice           Decimal                     @db.Decimal(10, 2) @map("list_price")
  discountAmount      Decimal                     @default(0) @db.Decimal(10, 2) @map("discount_amount")
  finalAmount         Decimal                     @db.Decimal(10, 2) @map("final_amount")
  intentReference     String?                     @unique @map("intent_reference") // current checkout
  source              String?                                                // ?ref= value, [a-z0-9_-]{1,40}
  confirmedAt         DateTime?                   @map("confirmed_at")
  canceledAt          DateTime?                   @map("canceled_at")
  canceledBy          String?                     @map("canceled_by")        // 'user' | 'admin'
  refundMethod        String?                     @map("refund_method")
  refundMethodDetails String?                     @map("refund_method_details")
  surveyRemindedAt    DateTime?                   @map("survey_reminded_at")
  createdAt           DateTime                    @default(now()) @map("created_at")
  updatedAt           DateTime                    @updatedAt @map("updated_at")
  @@unique([eventId, userId])
  @@index([eventId, status, earlyBird])
  @@index([userId, status])
  @@map("event_registrations")
}

model EventPayment {
  id             String                 @id @default(uuid())
  registrationId String                 @map("registration_id")
  wompiId        String                 @unique @map("wompi_id")   // idempotency barrier
  reference      String
  amount         Decimal                @db.Decimal(10, 2)          // what Wompi charged
  originalAmount Decimal                @db.Decimal(10, 2) @map("original_amount")
  discountAmount Decimal                @db.Decimal(10, 2) @map("discount_amount")
  flag           EventPaymentFlagEnum?
  refundStatus   EventRefundStatusEnum  @default(None) @map("refund_status")
  refundedAt     DateTime?              @map("refunded_at")
  refundedById   String?                @map("refunded_by_id")
  createdAt      DateTime               @default(now()) @map("created_at")
  @@index([registrationId])
  @@index([refundStatus])
  @@map("event_payments")
}

model EventSurveyResponse {
  id             String   @id @default(uuid())
  registrationId String   @unique @map("registration_id")
  attended       Boolean
  eventRating    Int?     @map("event_rating")   // 1–5, required when attended
  submittedAt    DateTime @default(now()) @map("submitted_at")
  @@map("event_survey_responses")
}

model EventTutorPayout {
  id          String   @id @default(uuid())
  eventId     String   @map("event_id")
  tutorId     String   @map("tutor_id")
  amount      Decimal  @db.Decimal(10, 2)
  paidAt      DateTime @map("paid_at")
  note        String?
  createdById String   @map("created_by_id")
  createdAt   DateTime @default(now()) @map("created_at")
  @@index([eventId])
  @@map("event_tutor_payouts")
}
```

**Changes to existing models**

```prisma
model Review {
  sessionId String?  // was required
  courseId  String?  // was required (event without a course)
  eventId   String?  @map("event_id")
  // existing @@unique([sessionId, studentId, tutorId]) stays (NULLs are distinct in Postgres)
  @@unique([eventId, studentId, tutorId])
  @@index([eventId])
}
// + SQL: ALTER TABLE reviews ADD CONSTRAINT reviews_session_xor_event
//        CHECK ((session_id IS NULL) <> (event_id IS NULL));

model User          { marketingOptInAt DateTime? @map("marketing_opt_in_at") }
model PaymentIntent { kind PaymentIntentKindEnum @default(session) }
```

**Exclusive arc rationale.** A review belongs to a session **or** an event:

- Two real nullable foreign keys plus a `CHECK` keep referential integrity and Prisma relations.
- A generic `targetType + targetId` would lose both.

Prisma does not model `CHECK` constraints. The constraint ships as an SQL file under `prisma/sql/`. The plan must verify locally that `db push` leaves it in place. If it does not, the repository enforces the rule and a test covers it.

**Code that must become null-safe** because of the `Review` change:

- `review.repository.js:46,187`, which include `session.course`;
- per-course rating aggregates, which must exclude `courseId IS NULL` from per-course groups but include those reviews in the tutor total;
- the public tutor reviews list, which shows the event title when `eventId` is set;
- `getStudentHistory`.

## 5. Flows

### 5.1 Public event page — `/eventos/[slug]`

- **Rendering.** A server `page.jsx` with `generateMetadata` (title, description, `og:image` = cover). It is the first page in the app with real metadata. It wraps a client view.
  - `generateMetadata` calls `event.service` directly on the server. This is a deliberate, documented exception to the fetch-through-API rule, because metadata must render server-side.
- **Public content** (no login): title, description, cover, course, date/time in `America/Bogota`, modality, location (in-person), tutors (name, photo, rating), price, and "N discounted spots left" when an early-bird is active. **`meetingUrl` is never returned** by public endpoints.
- **Logged-in and `Confirmed`:** the page shows "Registered ✓", the meeting link or location, "Cancel registration", and "Answer survey" once the event has ended.
- **Visibility by status:**
  - `Draft` → 404 for non-admins.
  - `Canceled` → visible with a "cancelled" banner.
  - Hidden events are reachable by slug.
- **Source tracking.** `?ref=<source>` is captured on landing and stored on the registration's first creation.

### 5.2 Login / registration return

"Register" without a session:

1. Store a pending action `{ type: 'event_register', slug, source, ts }` in localStorage. The TTL is 45 min, the same mechanism as `pendingBooking` (`src/app/services/utils/pendingBooking.js`).
2. Navigate to `/auth/login?returnTo=/eventos/<slug>?inscribir=1`. Login already honours `returnTo`.
3. Registration → verify email → `confirm-email` / `verify-email` consume the pending action and redirect to the event with `?inscribir=1`.
4. `?inscribir=1` opens the confirmation step. It never registers silently. The step shows price and discount plus the marketing opt-in checkbox, which is unchecked by default.

### 5.3 Free registration — `POST /api/events/[slug]/register`

In one transaction:

1. Lock the event row (`SELECT … FOR UPDATE`).
2. Assert `status=Published`, `now < startsAt`, `price = 0`.
3. Upsert the registration on `(eventId, userId)`:
   - already `Confirmed` → return it (idempotent, no second email);
   - otherwise → `Confirmed`, `listPrice=finalAmount=0`.
4. If opted in and `marketingOptInAt` is null, set it.

After commit, send the confirmation email if the registration was newly confirmed. The registration is open until `startsAt`.

### 5.4 Paid checkout — `POST /api/events/[slug]/checkout`

In one transaction:

1. `SELECT … FROM events WHERE id = $1 FOR UPDATE`. This serialises every checkout, fulfilment, and cancel decision for the event.
2. Assert `status=Published`, `now < startsAt`, `price > 0`.
3. If the user's registration is `Confirmed`, return `409 ALREADY_REGISTERED`.
4. Early-bird usage, excluding this user's rows:

   ```sql
   COUNT(*) WHERE event_id = $1 AND early_bird
     AND (status = 'Confirmed'
          OR (status = 'PendingPayment' AND reserved_at > now() - interval '30 minutes'))
   ```

   `earlyBird = earlyBirdSlots IS NOT NULL AND usage < earlyBirdSlots`.
5. Quote (`event-pricing.js`, pure):
   - `discount = round(price × pct / 100)` when early-bird, else 0;
   - `final = price − discount`.
   - Invariant: `final ≥ MIN_CHARGE_COP` (1,500), guaranteed by event validation.
6. Generate the reference `EVT-<ts>-<rand>`. Upsert the registration to `PendingPayment` with `earlyBird`, `reservedAt=now`, the amounts, `intentReference=reference`, and `source` (first creation only).
7. Create the `PaymentIntent { reference, kind: 'event', metadata: { registrationId, eventId, userId, listPrice, discountAmount, finalAmount, earlyBird } }`. If this fails, the transaction aborts and there is no checkout.

After commit, return the widget parameters: `reference`, `amountInCents`, `publicKey`, the integrity `signature`, and customer email/name from the DB. The client opens the Wompi widget exactly as `BookingForm` does today.

Rate limit: 10 checkout or register calls per user per minute (`rateLimit`).

### 5.5 Fulfilment — approved payment, kind `event`

`reconcileApprovedTransaction` has already verified the amount. Then, in one transaction:

1. If an `EventPayment` with this `wompiId` exists → no-op. This keeps webhook and confirm-payment idempotent.
2. Lock the event row (`FOR UPDATE`), then the registration row.
3. Decide the flag:
   - event `Canceled` → `EVENT_CANCELED`, refund `Pending`;
   - registration already `Confirmed` (paid twice from two tabs) → `DUPLICATE`, refund `Pending`;
   - registration `Canceled` → `REGISTRATION_CANCELED`, refund `Pending`. Example: the user paid in tab 1, cancelled, and then tab 2's payment arrived;
   - otherwise (`PendingPayment`):
     - If the intent was early-bird and its hold is no longer fresh (older than 30 min, or `intentReference ≠ reference`), recount usage. If the slots are exhausted, set flag `EARLY_BIRD_OVERRUN`; the price is still honoured and the refund status stays `None`.
     - Set the registration to `Confirmed` with the amounts and `earlyBird` **of this intent** (what was actually paid), `intentReference=reference`, and `confirmedAt`.
4. Insert the `EventPayment` (amounts from the intent, `amount` from Wompi).
5. Mark the `PaymentIntent` consumed.

After commit:

- newly confirmed → send the confirmation email;
- any flag → Sentry warning, and the payment appears under admin "pending refunds / anomalies".

A payment approved after `startsAt` (slow PSE) is still honoured.

### 5.6 Declined / error

The registration stays `PendingPayment`, and the hold expires by itself after 30 min. The user can retry; a retry creates a new intent and a new hold. No email is sent.

### 5.7 User cancellation — `POST /api/events/[slug]/cancel-registration`

- Only a `Confirmed` registration can be cancelled; otherwise the call returns `NOT_REGISTERED`. A `PendingPayment` hold simply expires.
- Allowed while `now < startsAt`. The registration becomes `Canceled` with `canceledBy='user'`.
- **Paid and ≥ 6 h before start:**
  - require `refundMethod` + `refundMethodDetails` (same options as tutoring);
  - set the registration's non-flagged payment to `refundStatus=Pending`.
- **Paid and < 6 h:** cancellation is allowed with no automatic refund. The UI warns before confirming.
- An early-bird slot held by a cancelled registration is freed, because usage counts only active rows.

### 5.8 Admin cancels the event

In one transaction:

1. Lock the event and set it to `Canceled`.
2. Set every `Confirmed`/`PendingPayment` registration to `Canceled` with `canceledBy='admin'`.
3. Set every `EventPayment` with `refundStatus=None` to `Pending`.

After commit:

- email everyone previously `Confirmed`;
- cancel the calendar event (`autoMeet`);
- write the audit entry.

### 5.9 Editing

- **Draft events** are freely editable, and deletable.
- **Published events** cannot be deleted, only cancelled.
- **Price, `earlyBirdSlots` and `earlyBirdPercent`** are locked once any registration row exists.
- **Date, time, link and location** stay editable. With `autoMeet`, a time change patches the calendar event. Registrants are informed with the "remind event" button; there is no automatic email.

## 6. Surveys, reviews and the popup

### 6.1 Survey — `POST /api/events/[slug]/survey`

**Body:** `{ attended, eventRating?, tutorRatings?: [{ tutorId, rating, comment? }] }`

**Rules:**

- The registration must be `Confirmed` and `now ≥ endsAt`.
- If a response already exists → `409 SURVEY_ALREADY_SUBMITTED`.
- `attended=false` → store the response only.
- `attended=true`:
  - `eventRating` must be 1–5;
  - `tutorRatings` must cover **exactly** the event's tutors, each rated 1–5;
  - each `comment` is at most 1,000 characters.

**One transaction:**

- create the `EventSurveyResponse`;
- create one `Review { eventId, tutorId, studentId, courseId: event.courseId, rating, comment, status: 'done' }` per tutor.

After commit:

- `updateTutorReviewStats(tutorId)` runs for each tutor. It already recomputes from every `done` review, so event reviews count automatically.
- `notifyReviewReceived` runs for each tutor.

**UI.** One screen: "Did you attend?" Yes/No. "No" submits immediately. "Yes" reveals event stars and, per tutor, stars plus an optional comment.

### 6.2 Pending feedback — `GET /api/me/pending-feedback`

Returns **one** item or `null`. Event surveys come first, most recently ended first:

- `event_survey`: a `Confirmed` registration whose event has ended and that has no response.
- `session_review`: the existing `canRate` rule (`TutoringHistory.jsx:626`). The session is past, not `Canceled`/`Rejected`, and has a pending `Review` with a null rating.

### 6.3 Popup — `PendingFeedbackPrompt`

- Mounted in `StudentHome`. It opens `EventSurveyModal` or the existing `ReviewModal`.
- Dismissing it stores `calico_feedback_prompt_dismissed_<userId>` = today's local date in localStorage. The prompt shows again on the next local day.
- After a successful submit, the next pending item (if any) is shown immediately.
- Built on the `NewsReaderModal` pattern: `role="dialog"`, Escape closes, body scroll lock.
- **Side fix:** clicking a `review_reminder` notification today falls into the default branch and does nothing (`NotificationDropdown.jsx:338`). It will open the same review flow.

## 7. Admin (`/home/admin/eventos`)

Guarded by `requireAdminUser`. Every mutation writes `AdminAuditLog` with new `ADMIN_ACTIONS`. A new entry is added to `AdminShell` `NAV_GROUPS` and `src/routes.js`.

- **List:** filter by Draft / Published / Finished / Cancelled. Shows date, price, confirmed count, and survey response rate.
- **Create / edit form** (zod-validated):
  - `title` 3–120 characters; `description` ≤ 5,000.
  - Cover upload: reuses the news S3 upload with the `event-images/` prefix.
  - Course (optional), tutors (≥ 1, all `isTutorApproved`), `startsAt < endsAt`.
  - Modality:
    - Virtual → `autoMeet` or a valid `https` `meetingUrl`;
    - InPerson → `location` required.
  - Pricing:
    - `price` is an integer COP ≥ 0. If `price > 0`, then `price ≥ 1,500`.
    - Early-bird: slots 1–1000 and percent 1–99, both or neither, only when `price > 0`. `price − round(price × pct/100)` must be ≥ 1,500.
  - `isListed`.
- **Publish:**
  - validates everything;
  - requires `startsAt` in the future;
  - with `autoMeet`, creates the central-calendar event and stores `meetingUrl`. On calendar failure, publish fails with `CALENDAR_ERROR` (stays Draft), and the admin can retry or paste a link.
- **Detail tabs:**
  - **Registrations:** name, email, career, source, status, early-bird, amount, survey answered. CSV export.
  - **Payments:**
    - totals: gross, Wompi fees, refunds pending/done, tutor payouts recorded, net;
    - net is defined as Σ(non-refunded `amount`) − Σ `wompiFee(amount)` over all payments (fees are lost even on refunds) − Σ tutor payouts;
    - a **pending refunds / anomalies** list with the flag, user, refund method/details, and a "mark refunded" action.
  - **Survey:** response rate, attendance rate, event average, per-tutor average, comments.
  - **Tutors:** record manual payouts (tutor, amount, paid date, note).
- **Actions:**
  - **Remind event:** emails all `Confirmed`. Refused if `lastReminderAt` is under 1 h ago, which protects against double clicks.
  - **Remind survey:** emails only `Confirmed` registrations of an ended event with no response and `surveyRemindedAt` null or older than 24 h. It sets `surveyRemindedAt` and returns `{ sent, failed, skipped }`, following the `sendAvailabilityReminders` pattern (`admin.service.js:734`).

The fee math lives in `fees.js`. Add `eventCalicoNet(amount) = amount − wompiFee(amount)` there; no inline percentages. Existing platform metrics (`admin-metrics`, `admin-growth`, payouts) are **not** changed. Event revenue lives in the event admin views only (phase 3 may unify).

## 8. Emails, calendar, tutor and student views

### 8.1 Emails

There are four new Brevo templates:

| Key | When | Params (UPPER_SNAKE) |
|---|---|---|
| `EVENT_REGISTRATION_CONFIRMED` | on confirm (free or paid) | name, title, date/time, modality, link or location, amount, event URL; `.ics` attachment |
| `EVENT_REMINDER` | admin "remind event" | same, minus amount |
| `EVENT_CANCELED` | admin cancels event | title, date, refund note when paid |
| `EVENT_SURVEY_REMINDER` | admin "remind survey" | name, title, link `/eventos/<slug>?encuesta=1` |

- Each template follows the `isXConfigured()` → `EMAIL_TEMPLATE_NOT_CONFIGURED` → 503 pattern.
- Reference HTML goes in `docs/emails/`.
- The templates themselves are created in the Brevo dashboard by the team, and their IDs are added to `TEMPLATE_IDS`.
- `.ics`: `src/lib/utils/ics.js` builds one `VEVENT` with UID = event id, UTC `DTSTART`/`DTEND`, `SUMMARY`, `LOCATION` or `URL`, and `DESCRIPTION`. It is sent as a Brevo base64 `attachment`.

### 8.2 Calendar

`calico-calendar.service` gains a generic `create/update/cancel` for an event meeting: title, description, start/end, Meet conference, access `ANYONE`, no attendees, `sendUpdates: 'none'`.

**Known limit:** a Meet call has a plan-dependent participant cap (typically 100). This is noted; v1 adds no capacity limit.

### 8.3 Student

- Public `/eventos`: upcoming, listed, published events.
- Home card "Your upcoming events", plus "Events you might like" (upcoming listed events).
- `GET /api/me/events`.

### 8.4 Tutor

A read-only "My events" list in the tutor zone shows date, link, and confirmed count (`GET /api/tutor/events`, `requireTutor`).

### 8.5 i18n and UI

- Every string is in `es.json` and `en.json`.
- Money and dates use `formatCurrency`/`formatDate`.
- CSS tokens only; `<Button>` for all buttons; tutor-zone accent `--calico-blue-tutor`.

## 9. API surface

```
Public / student
GET  /api/events                         listed, published, upcoming (s-maxage 30)
GET  /api/events/[slug]                  tryAuthenticateRequest; myRegistration + meetingUrl only if Confirmed
POST /api/events/[slug]/register           authenticateRequest — free
POST /api/events/[slug]/checkout           authenticateRequest — paid
POST /api/events/[slug]/cancel-registration authenticateRequest
POST /api/events/[slug]/survey             authenticateRequest
GET  /api/me/events                      authenticateRequest
GET  /api/me/pending-feedback            authenticateRequest
GET  /api/tutor/events                   requireTutor

Admin (requireAdminUser)
GET|POST        /api/admin/events
GET|PATCH|DELETE /api/admin/events/[id]          (DELETE: Draft only)
POST /api/admin/events/[id]/publish
POST /api/admin/events/[id]/cancel
POST /api/admin/events/[id]/remind
POST /api/admin/events/[id]/survey-reminder
GET  /api/admin/events/[id]/registrations        (?format=csv)
GET  /api/admin/events/[id]/payments
POST /api/admin/events/[id]/payments/[paymentId]/refunded
GET  /api/admin/events/[id]/survey
GET|POST /api/admin/events/[id]/tutor-payouts
POST /api/admin/events/image
```

Public routes are keyed by `[slug]`, which is immutable once the event is published. The App Router allows only one dynamic segment name per level, so `[slug]` and `[id]` cannot be siblings. Services resolve slug → id, and every lock and query runs on the id. Admin routes use `[id]` under their own path.

Identity always comes from `auth.sub`, never from the body or URL. Dynamic `params` are awaited.

**Error codes:**

- `EVENT_NOT_FOUND`
- `EVENT_NOT_OPEN` (draft, cancelled, or started)
- `ALREADY_REGISTERED`
- `NOT_REGISTERED`
- `EVENT_IS_FREE` / `EVENT_IS_PAID` (wrong endpoint)
- `REFUND_DETAILS_REQUIRED`
- `SURVEY_NOT_AVAILABLE`
- `SURVEY_ALREADY_SUBMITTED`
- `INVALID_SURVEY`
- `PRICE_LOCKED`
- `CALENDAR_ERROR`
- `EMAIL_TEMPLATE_NOT_CONFIGURED`

## 10. Testing

### 10.1 Unit (Jest, mocks, existing pattern)

- `event-pricing` quote and validation, including rounding and the ≥ 1,500 invariant.
- `eventCalicoNet`.
- The registration state machine.
- Survey validation.
- Slug generation.
- `ics` output.
- `reconcileApprovedTransaction`: frozen-amount match/mismatch, dispatch by kind, legacy fallback.
- Wompi base URL by key prefix.

### 10.2 API routes (existing mock pattern)

For every new route:

- auth required or optional;
- IDOR (a body `userId` is ignored);
- validation errors and error codes;
- `meetingUrl` hidden from non-confirmed users.

### 10.3 Integration against real Postgres (new; the concurrency guarantees)

**Setup.** `pnpm test:integration` is a separate Jest project (`node` environment, `**/__integration__/**`) running against the docker-compose Postgres.

- `globalSetup` runs `prisma db push --force-reset` on the test database.
- It **refuses to run unless the database host is local** (`localhost`, `127.0.0.1`, or the CI service). A force-reset against RDS would wipe production.
- CI adds a `postgres:16` service and runs this suite after `pnpm test`.

**Required cases:**

1. 20 parallel checkouts by 20 users on an event with 5 early-bird slots → exactly 5 discounted registrations.
2. Webhook and confirm-payment fulfilling the same transaction in parallel → 1 `EventPayment`, 1 `Confirmed`.
3. Two different approved transactions for the same registration → second flagged `DUPLICATE`, refund `Pending`.
4. Admin cancels the event while a payment is being fulfilled → payment flagged `EVENT_CANCELED`, refund `Pending`, registration `Canceled`.
5. Expired early-bird hold, slots taken meanwhile, payment arrives → `Confirmed` at the paid price, flag `EARLY_BIRD_OVERRUN`.
6. 50 parallel free registrations by the same user → 1 row.
7. User cancels an early-bird registration → the slot is available to the next checkout.
8. Task 0: the course price changes between intent and approval → the session is still booked at the paid amount.
9. `reviews_session_xor_event` constraint rejects a row with both or neither FK. If the constraint cannot be kept under `db push`, this tests the repository rule instead.

### 10.4 E2E (Playwright, already installed, currently unused)

Runs locally against the dev server, the test database, and Wompi sandbox (`pnpm test:e2e`, not in CI in v1). `playwright.config.js` is adjusted for functional tests.

1. Free flow: public page → register → verify email (token read from the test DB) → back to the event → register → (event moved to the past) → popup → survey → review visible on the tutor profile.
2. Paid flow with sandbox cards: `4242 4242 4242 4242` approved → `Confirmed`; `4111 1111 1111 1111` declined → still `PendingPayment`, retry works.

The Wompi widget is a third-party iframe and may be brittle. If it cannot be automated reliably, the paid flow is covered by §10.5 instead.

### 10.5 QA on a Vercel preview (Claude in Chrome, sandbox keys)

Run a scripted checklist covering:

- the student, tutor, and admin views;
- every error state and both locales;
- mobile width.

Each flow is recorded as a GIF. This requires Task 0b.

### 10.6 Production validation (hidden events, `isListed=false`)

1. **Free.**
   - Register with a real account → confirmation email and `.ics` arrive.
   - Admin moves `endsAt` to the past → popup appears → submit the survey → the review appears on the profile.
   - Use a **test tutor account**, or delete the test reviews afterwards, so real ratings are not polluted.
2. **Paid.**
   - Price 2,000 COP with 1 early-bird slot at 10 %.
   - Account A pays 1,800, account B pays 2,000.
   - Verify the webhook, `EventPayment` rows, the admin totals, and the emails.
   - A cancels (≥ 6 h) → pending refund → refund manually → mark refunded.
3. **Declined.** A declined card leaves the registration `PendingPayment`, and a retry succeeds.

Concurrency is **not** tested in production; §10.3 covers it.

### 10.7 Definition of ready

The feature is ready when:

- §10.1–10.4 are green;
- the §10.5 checklist is complete with evidence;
- all three §10.6 scenarios pass;
- the schema is applied to RDS via `db push` after reviewing the diff, with explicit approval before touching production.

## 11. Rollout

1. Create the four Brevo templates and add their IDs.
2. Locally: `db push` and add the `CHECK` constraint SQL; verify that a second `db push` keeps it.
3. Merge to `dev` → preview QA (§10.5) → `main`.
4. Apply the schema to RDS (with explicit approval) **before** the deploy that reads the new columns. The new client selects `reviews.event_id` and `payment_intents.kind`.
5. Run the production validation (§10.6), then announce the first real event.

## 12. Out of scope (phase 3+)

- Automatic reminders (cron).
- New-event announcements segmented by career or course (needs opt-in plus unsubscribe).
- Capacity and waitlist.
- Coupons on events.
- Unifying `EventPayment` into `Payment` and a generic `Order` layer.
- A survey builder.
- Admin approval of registrations.
- Event revenue in the platform-wide metrics.

## 13. Open items

- Brevo template IDs: the team creates the templates during implementation.
- A test tutor account for the production validation.

## 14. Unrelated defects found during exploration

These are recorded in `docs/BACKLOG.md` and are not part of this work:

- The `'TXN'` studentId fallback in `webhook/route.js:203`.
- The rate-limit bucket cleanup ignores `windowMs`.

The tutor-stats cancellation defect is already tracked.
