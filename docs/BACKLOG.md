# Calico — Backlog & Tech Debt

Active items only. Delete an item when it is resolved; add a note to the relevant commit instead.

---

## 🔴 High — Blocks developer workflow

### Prisma migration history broken

**What:** `prisma migrate dev` fails because the migration `20260509180000_add_review_course_id` references `reviews.tutor_id`, a column that did not exist at that point in the migration history. Any new team member cannot bootstrap the DB from scratch using `migrate dev`.

**Cause:** The `reviews` table was reformed with `db push` or raw SQL (renaming `reviewee_id`→`tutor_id`, `score`→`rating`, adding `student_id` and `status`) without generating a migration file. The reconciliation migration from 2026-05-17 fixed FKs in other tables but missed `reviews`.

**Impact:** All schema changes must use `pnpm db:push` instead of `pnpm db:migrate`. Each push widens the gap.

**Workaround (current):**
1. Preview: `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
2. Apply: `pnpm db:push`

**Fix (re-baseline):**
1. Take an RDS snapshot first (AWS console → "Take snapshot")
2. Archive old migrations: `mv prisma/migrations prisma/migrations_backup`
3. Generate baseline from current schema:
   ```bash
   mkdir -p prisma/migrations/0_init
   pnpm exec prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script --output prisma/migrations/0_init/migration.sql
   ```
4. Verify `0_init/migration.sql` contains all tables including `reviews` with `tutor_id` / `status` / `rating`
5. Test on a copy first (restore dump locally, point `DATABASE_URL` there, run `pnpm exec prisma migrate dev`)
6. On prod — reset migration accounting only (no data touched):
   ```bash
   pnpm exec prisma db execute --file <(echo 'DELETE FROM "_prisma_migrations";') --schema prisma/schema.prisma
   pnpm exec prisma migrate resolve --applied 0_init
   ```
7. Verify: `pnpm exec prisma migrate status` → "Database schema is up to date"
8. All team members must re-clone the `prisma/migrations/` folder after this

**Coordination required:** Everyone with a local copy of `_prisma_migrations` needs to resync.

---

## 🟡 Medium — Works but incomplete or risky

### Bulk payout marking has no validation and no transaction

**What:** `payouts.service.bulkMarkPayoutsAsPaid` documents "validates every id is pending; rolls back on partial failure", but it just runs `updateMany` on whatever UUIDs arrive: already-paid rows, other tutors' rows or payments of cancelled sessions get re-marked silently. Found in the coupons audit (Sep 2026).

**Fix:** load the ids under the payouts `READY_FILTER`, refuse the batch if any id is missing, and wrap in `prisma.$transaction`.

### Tutor balances are gross and `totalEarning` can double count

**What:** `TutorProfile.nextPayment` / `totalEarning` accumulate 100 % of the payout base (not the 85 % share), while `admin-users` / payouts / tutor statistics show 85 %. `totalEarning` is incremented both by `completeSession` and by `PUT /api/payments/[id]` → double count when an admin marks a completed session's payment paid. Since the coupons feature both fields are fed with `tutor_payout_base` (consistent base), but the 85 % semantics and the double count remain.

**Fix:** decide one definition (store the 85 % share, or keep the base and always apply `tutorPayout()` when displaying) and remove one of the two increment paths.

### Two cancellation implementations with different money semantics

**What:** `session.service.cancelSession` decrements `totalEarning`/`numSessions`; `PUT /api/sessions/[id]/cancel` (the route the UI actually calls) does not. `session.repository.updateSessionCancellation` writes a `refundAmount` column that does not exist (dead, would throw). Refund amounts live only in the admin email (`ORIGINAL_AMOUNT` = charged amount).

**Fix:** route the cancel endpoint through the service, drop the dead repository method, and persist the refunded amount if refunds are to be reconciled.

### Coupon use is not released when a paid session is cancelled

**What:** a `CouponRedemption` stays `APPROVED` after the session is cancelled/refunded, so it keeps counting against `maxRedemptions` and `perUserLimit`. Deliberate v1 scope.

**Fix:** add an admin "release use" action (or release automatically on refund) that sets the redemption to `RELEASED` and audits it.

### Brevo email templates 11 / 12 / 13 not created in dashboard

**What:** The code in `src/lib/services/email.service.js` references template IDs 11 (`TUTOR_APPLICATION_APPROVED`), 12 (`TUTOR_APPLICATION_REJECTED`), and 13 (`TUTOR_SUSPENDED`), but these templates do not yet exist in the Brevo dashboard.

**Impact:** When an admin approves, rejects, or suspends a tutor, the email send fails silently (fire-and-forget catch). The admin action itself still completes and is logged.

**Fix:** Create the three templates in the Brevo dashboard. Parameters each template expects:

| Template | ID | Required params |
|---|---|---|
| TUTOR_APPLICATION_APPROVED | 11 | `tutorName`, `approvedCourses` (array) |
| TUTOR_APPLICATION_REJECTED | 12 | `tutorName`, `rejectionReason` |
| TUTOR_SUSPENDED | 13 | `tutorName`, `suspensionReason` |

See `email.service.js` lines ~16–29 for the exact params sent.

---

### Next.js Edge middleware not implemented

**What:** `src/middleware.js` does not exist. There is no single bouncer intercepting all `/home/admin/**` and `/api/admin/**` requests.

**Why not done:** `jsonwebtoken` (CommonJS) is incompatible with the Next.js Edge runtime. Migrating to `jose` is required first.

**Current defense:** `requireAdminUser(request)` is called inside each admin route handler (the real security boundary). The client-side layout guard in `src/app/home/admin/layout.jsx` redirects non-admins before they see any UI.

**Risk:** A future `/api/admin/**` route that forgets to call `requireAdminUser` would be unprotected by any layer above it.

**Fix:** Migrate JWT verification from `jsonwebtoken` to `jose` in `src/lib/auth/jwt.js`, then add `src/middleware.js` to intercept all admin paths.

---

### Admin endpoint tests deferred

**What:** The 12 endpoints under `/api/admin/**` and their service orchestrators (`admin.service.js`, `admin-metrics.service.js`, `admin-growth.service.js`, `admin-users.service.js`) have no automated test coverage.

**Why deferred:** Tests were scoped out during Phases 2–7 to keep scope manageable.

**Risk:** Low for existing code (handlers are thin, services are pure); medium for future modifications where a regression could go undetected.

**Fix:** Dedicate a focused sprint to mock Prisma + audit + email in Jest and cover the admin service layer. Estimated: 1–2 days.

---

### Tutor suspension: no calendar cleanup, no Wompi refund, no student emails

**What:** When a tutor is suspended, future sessions are bulk-canceled (`cancellation_reason = TUTOR_SUSPENDED`), but:
- Google Calendar events for those sessions are **not deleted**
- Wompi refunds are **not processed automatically**
- Affected students receive **no email notification**

**Workaround:** Support team can query `WHERE cancellation_reason = 'TUTOR_SUSPENDED'` and handle these manually.

**Fix:** After suspending, cascade into `calicoCalendar.deleteEvent()` for each canceled session, trigger Wompi refunds, and send student notification emails. Requires coupling `admin.service.js` to calendar and Wompi services carefully.

---

## 🟢 Low — Nice to have, no urgency

### Manual sessions accept any amount without price reconciliation

**What:** `POST /api/admin/manual-sessions` takes `amount` from the body (`z.coerce.number().min(0)`) and never checks it against `Course.basePrice × hours`, unlike the Wompi path. Admin-only, but it credits `nextPayment` directly. Rows are stored with `discount_amount = 0` and `tutor_payout_base = amount`.

### Profitability table compares a per-hour list price with per-session gross

**What:** `admin-growth.service.getCourseProfitability` exposes `listPrice = Course.basePrice` (per hour) next to `gross` and `breakEvenPrice` derived from per-session payments — misleading for sessions ≠ 1 h.

### `BookingForm` is not internationalised

**What:** ~30 hardcoded Spanish strings and a hand-formatted total; only the coupon block (added Sep 2026) goes through `useI18n`. `BookingSummary` had the same issue for its total (fixed).

### 2FA for admin accounts not implemented

`User.otpCode` exists and could be reused. Consider TOTP (Google Authenticator) when the admin team grows or when a third-party support role is introduced.

---

### No limit on tutor re-applications

A rejected applicant can reapply unlimited times, potentially flooding the "Pending" queue. Consider a cooldown period (`reapply_after` timestamp) on `TutorApplication`.

---

### Legacy admin endpoints still use `x-admin-secret`

`/api/admin/course-prices/**` and `/api/admin/tutor-courses/**` still authenticate with `requireAdmin` (`x-admin-secret`), not `requireAdminUser`. These are not human-facing (called via curl/scripts), but they lack any audit trail. Migrate when the pricing editor moves into the admin UI.

---

### `isTutorRequested` not set in `submitApplication`

The `approveTutor` service historically checked `isTutorRequested = true`. This was worked around in the new admin panel flow. The legacy field can be cleaned up when the old `PUT /api/admin/tutors/[userId]` endpoint is removed.
