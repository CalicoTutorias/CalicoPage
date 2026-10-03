# Events — rollout and testing guide

Step-by-step guide to ship the events feature (group "repasos", paid or free, with post-event surveys) to production and to validate it. Design: [`docs/superpowers/specs/2026-10-03-eventos-design.md`](../superpowers/specs/2026-10-03-eventos-design.md). Reference: [`docs/specs/technical.md`](../specs/technical.md) and [`docs/specs/functional.md`](../specs/functional.md) (Events sections).

The feature is **additive**: new tables, nullable columns, no `DROP`. Nothing is visible to users until an admin publishes an event.

Run commands from the repo root. Never point a local command at RDS unless the step says so.

---

## 0. Pre-flight checklist

| # | Check | How |
|---|---|---|
| 1 | Branch is merged to `dev` and CI is green (unit + integration) | GitHub PR checks. The integration job (postgres:16 service) had not run on GitHub when this was written — watch the first run |
| 2 | Four Brevo templates exist and their IDs are in `TEMPLATE_IDS` | Section 1 |
| 3 | RDS snapshot taken | Section 2.1 |
| 4 | Schema SQL applied to RDS | Section 2 |
| 5 | Vercel env vars present (production) | `CALICO_CALENDAR_ID`, `GOOGLE_ADMIN_REFRESH_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Meet auto-creation); `WOMPI_*` production keys; `BREVO_API_KEY`; `AWS_*` (cover uploads, `event-images/` prefix) |
| 6 | A test tutor account exists (approved tutor) | So test reviews do not pollute a real tutor's rating (section 5) |

---

## 1. Brevo templates

Create four transactional templates in the Brevo dashboard. The reference HTML is committed; paste it into the template editor. The **subject line** is in each file's header comment.

| Key in `TEMPLATE_IDS` | HTML file | Sent when |
|---|---|---|
| `EVENT_REGISTRATION_CONFIRMED` | `docs/emails/event-registration-confirmed.html` | A registration becomes `Confirmed` (free or paid). Carries an `.ics` attachment |
| `EVENT_REMINDER` | `docs/emails/event-reminder.html` | Admin clicks "Recordar evento" |
| `EVENT_CANCELED` | `docs/emails/event-canceled.html` | Admin cancels a published event |
| `EVENT_SURVEY_REMINDER` | `docs/emails/event-survey-reminder.html` | Admin clicks "Recordar encuesta" |

Steps:

1. In Brevo create each template from the HTML file. Set the subject exactly as in the file header. Leave Brevo's preview-text field empty (the HTML has a hidden preheader).
2. Note each numeric template ID.
3. Edit `TEMPLATE_IDS` in `src/lib/services/email.service.js` and replace the four `null` values with the IDs.
4. Commit that change in the same PR/branch that ships to `main`.

What happens while an ID is still `null`:

- Registration confirmation emails are **skipped** (a warning is logged; the registration itself succeeds).
- `POST /api/admin/events/[id]/remind` and `/survey-reminder` answer **503** `EMAIL_TEMPLATE_NOT_CONFIGURED`.
- Cancellation emails fail without blocking the cancellation (failures are logged as warnings).

Param names are listed in each template header and in `technical.md` (Brevo section). Empty-string params hide the block, so do not rename them.

---

## 2. Production schema

The Prisma client selects `reviews.event_id`, `payment_intents.kind`, and `users.marketing_opt_in_at`. The columns must exist in RDS **before** the new code is deployed, otherwise reads of those tables break.

Two SQL files in `prisma/sql/` carry the change:

1. `prisma/sql/2026-10-03-events-schema.sql` — generated diff (`prisma migrate diff`) from `main`'s schema to this branch's. Creates the enums, the six new tables, the new nullable columns (`reviews.event_id`, `payment_intents.kind` with default, `users.marketing_opt_in_at`), relaxes `reviews.session_id` and `reviews.course_id` to nullable, and adds the indexes/unique constraints. It contains **no `DROP TABLE` and no `DROP COLUMN`**. It intentionally does **not** touch `reviews_course_id_fkey` (the existing FK stays `ON DELETE RESTRICT`, which matches `onDelete: Restrict` in the schema).
2. `prisma/sql/reviews_session_xor_event.sql` — the `CHECK` constraint `reviews_session_xor_event` (a review belongs to a session **or** an event, never both, never neither). Prisma cannot model `CHECK` constraints, so it lives in SQL.

### 2.1 Snapshot

In the AWS console: RDS → the Calico instance → Actions → Take snapshot. Wait until it is `available`.

### 2.2 Review the diff

Read `prisma/sql/2026-10-03-events-schema.sql` end to end. Confirm there is no `DROP TABLE` / `DROP COLUMN` / `TRUNCATE` / `DELETE`:

```bash
grep -nE "DROP|TRUNCATE|DELETE FROM" prisma/sql/2026-10-03-events-schema.sql
```

Expected: only the two `ALTER COLUMN ... DROP NOT NULL` lines for the `reviews` relaxations (nothing else).

### 2.3 Apply to RDS

Point `DATABASE_URL` at RDS **only for these two commands** (for example `DATABASE_URL='postgresql://…' pnpm exec …`):

```bash
pnpm exec prisma db execute --file prisma/sql/2026-10-03-events-schema.sql
pnpm exec prisma db execute --file prisma/sql/reviews_session_xor_event.sql
```

Run them in this order (the CHECK needs `reviews.event_id`). Expected: each prints `Script executed successfully.`

Verify:

```sql
\d reviews                       -- event_id present; session_id, course_id nullable; CHECK reviews_session_xor_event
\d payment_intents               -- kind column, default 'session'
SELECT count(*) FROM events;     -- 0
```

Existing reviews all have `session_id` set and `event_id` NULL, so the CHECK passes.

### 2.4 Why not `db push`

- `prisma db push` against production is possible, but Prisma 7 refuses `--accept-data-loss` when it detects an AI agent, and `db push` shows a spurious data-loss prompt for the new `reviews` unique `(event_id, student_id, tutor_id)`. The reviewed SQL file avoids both problems and is deterministic.
- If anyone does run `db push` later (production or local), **re-apply the CHECK afterwards**: `prisma db push` removes constraints it does not know about.

  ```bash
  pnpm exec prisma db execute --file prisma/sql/reviews_session_xor_event.sql
  ```

  The file is idempotent (`DROP CONSTRAINT IF EXISTS` then `ADD`).

---

## 3. Deploy order

1. Section 1 done (template IDs committed).
2. Section 2 done on RDS (**before** any deploy that reads the new columns). The old code keeps working against the new schema because everything is additive.
3. PR to `dev` → CI (unit + integration) → Vercel preview.
4. Preview QA (section 4). Previews can use Wompi **sandbox** keys: the Wompi API base follows the key prefix (`prv_test_` → sandbox), not `NODE_ENV`.
5. Merge `dev` → `main`. Vercel deploys production.
6. Production validation (section 5) with hidden events.
7. Announce the first real event.

Preview environment needs: sandbox `WOMPI_PUBLIC_KEY` / `WOMPI_PRIVATE_KEY` / `WOMPI_INTEGRITY_SECRET`, a database that has the schema from section 2 (a preview against RDS also needs section 2), and the Google/Brevo vars if you want to test Meet and emails.

---

## 4. Manual QA on the preview

Use three accounts: an **admin**, a **student** (email verified), and an approved **tutor**. Use sandbox cards:

| Card | Result |
|---|---|
| `4242 4242 4242 4242` | Approved |
| `4111 1111 1111 1111` | Declined |

Minimum charge is **1,500 COP**: price must be 0 or ≥ 1,500, and an early-bird price must also stay ≥ 1,500.

### 4.1 Admin

Go to `/home/admin/eventos`.

| # | Steps | Expected |
|---|---|---|
| A1 | New event: title, description, cover image, tutor(s), start/end in the future, Virtual + auto Meet, price 0, listed | Saves as **Draft**; not visible on `/eventos`; direct URL `/eventos/<slug>` is 404 for a student |
| A2 | "Publicar" A1 | Status **Published**; a Meet link is stored (with Google env vars). Without them: `CALENDAR_ERROR` and the event stays Draft — paste an `https://` link instead of auto Meet and retry |
| A3 | Create a paid event: price 5,000, early-bird 2 slots at 20 % | Saves. Price below 1,500, or a discounted price below 1,500, is rejected with a field error. Early-bird slots without a percent (or vice versa) is rejected |
| A4 | Empty price field | Rejected (400), never treated as free |
| A5 | Create an in-person event | `location` required; no Meet created |
| A6 | Edit a Published event's date/time/link | Saved; with auto Meet the calendar event is patched. Registrants are not emailed automatically |
| A7 | After the first registration, edit price or early-bird | Rejected `PRICE_LOCKED` (409) |
| A8 | Delete a Draft | Deleted. Deleting a Published event is rejected (`INVALID_STATE`) — cancel it instead |
| A9 | Event detail → tab "Inscritos" | Name, email, career, source, status, early-bird, amount, survey answered |
| A10 | "Inscritos" → "Descargar CSV" | CSV downloads; a name starting with `=`/`+`/`-`/`@` is prefixed with `'` (formula-injection guard) |
| A11 | Tab "Pagos" | Totals: gross, Wompi fees, refunds pending/done, tutor payouts, net. Pending refunds / anomalies list with flag, user, refund method/details |
| A12 | "Marcar reembolsado" on a pending refund, confirm with "Sí, ya está reembolsado" | Row moves to Refunded; totals update; audit entry `EVENT_PAYMENT_REFUNDED` |
| A13 | "Recordar evento" | `{ sent, failed }` toast. Second click within 1 h → 429 `REMINDER_COOLDOWN`. Button only on Published, not-ended events |
| A14 | After the end time: "Recordar encuesta" | Emails only Confirmed registrants without a response and not reminded in 24 h; shows sent/failed/skipped. Only available after the event ended |
| A15 | Tab "Encuesta" | Response count, attendance rate (attended ÷ responses), event average, per-tutor average, comments |
| A16 | Tab "Tutores" → record a payout (tutor, amount, paid date, note) | Appears in the list; net in Payments tab decreases |
| A17 | "Cancelar evento" on a Published event (with a reason) | All registrations Canceled; every payment with refund `None` → `Pending`; Meet calendar event removed (auto Meet); cancellation email to everyone who was Confirmed |
| A18 | Admin audit page | Entries for create/update/publish/cancel/delete/remind/payout/refund |
| A19 | Hidden event (`isListed` off) | Not on `/eventos` or home cards; reachable by link |

### 4.2 Student

| # | Steps | Expected |
|---|---|---|
| S1 | Logged out: open `/eventos/<slug>` of a published event | Page renders with OG preview; shows tutors, date/time (Bogotá), price, "N discounted spots left" if early-bird. **No meeting link** |
| S2 | Logged out: click Register | Redirected to login with return to the event. Pending action stored (45 min TTL) |
| S3 | Register a new account, verify email | Lands back on the event with the confirmation step (`?inscribir=1`); never registers silently |
| S4 | **Free flow**: confirm step (marketing checkbox unchecked by default) → "Inscribirme" | Success title "¡Listo! Te inscribiste"; badge "Estás inscrito"; Meet link or location visible; confirmation email with `.ics` (if templates are set) |
| S5 | Register again / double-click | Idempotent: still one registration, no second email |
| S6 | Tick the marketing checkbox on a registration | `users.marketing_opt_in_at` set (once) |
| S7 | **Paid flow, approved**: "Pagar e inscribirme {price}" → Wompi widget → `4242 4242 4242 4242` | Page shows processing, then "Estás inscrito" (Confirmed); confirmation email with amount |
| S8 | **Paid flow, declined**: `4111 1111 1111 1111` | Registration stays `PendingPayment`; payment error shown; retry works; a Wompi PENDING status (PSE/Nequi) shows a "payment in progress" notice and the retry is secondary (avoid double charges) |
| S9 | **Early-bird counter**: with 2 slots, two students check out | Public page counter ("Quedan {count} cupos con {percent}% de descuento") drops as holds are made; the first two pay the discounted price, the third pays full price. A hold lasts 30 min; an abandoned checkout frees its slot after that |
| S10 | **Cancel ≥ 6 h before start** (paid) ("Cancelar inscripción") | Asks for refund method + details (`REFUND_DETAILS_REQUIRED` if missing); registration Canceled; refund appears as Pending in admin; early-bird slot freed |
| S11 | **Cancel < 6 h before start** (paid) | UI warns first; cancellation allowed; **no** refund queued |
| S12 | Cancel a free registration | Canceled, no refund prompt |
| S13 | Try to register after `startsAt` | Rejected (`EVENT_NOT_OPEN`) |
| S14 | **Survey and popup**: after `endsAt`, open student home | Popup (`PendingFeedbackPrompt`) shows the event survey. Dismiss → does not return until the next local day. It never expires until answered |
| S15 | Survey: "No" attended | Submits immediately; no reviews created |
| S16 | Survey: "Yes" → event stars + stars (+ optional comment) per tutor | Success; next pending item (if any) shows immediately; tutor profile shows the new review with the **event title** and the rating average/count update |
| S17 | Submit survey twice | 409 `SURVEY_ALREADY_SUBMITTED` |
| S18 | `/eventos/<slug>?encuesta=1` (link from the reminder email) | Opens the survey |
| S19 | Student home event cards ("your upcoming events" and "events you might like") | Upcoming registered events; listed upcoming events (hidden ones excluded) |
| S20 | A `review_reminder` notification click | Opens the review flow (previously did nothing) |
| S21 | Mobile width (≈ 375 px) | Event page, confirm modal, Wompi step, survey modal usable; 44 px star targets; no horizontal scroll. Check both `es` and `en` |

### 4.3 Tutor

| # | Steps | Expected |
|---|---|---|
| T1 | Tutor zone → "Mis eventos" (`GET /api/tutor/events`) | Read-only list of events the tutor teaches: date, link, confirmed count |
| T2 | Non-tutor / unapproved user calls the endpoint | 403 |
| T3 | After a student survey | Review with the event title on the tutor's public profile; tutor receives a review notification |

---

## 5. Production validation (hidden events)

Always use `isListed = off` events so real users do not see them. Concurrency is **not** tested here (the integration suite covers it).

Use a **test tutor account** as the event's tutor so real ratings are not polluted. If you must use a real tutor, clean up afterwards (section 5.4).

### 5.1 Hidden free event

1. Admin: create a free event (price 0, hidden), start in the future, publish.
2. Open the link in a private window with a real student account. Register.
3. Expected: badge "Estás inscrito"; confirmation email arrives **with the `.ics`** attachment; the Meet link is in the email and on the page.
4. Move the event into the past: edit `endsAt` (and `startsAt`) in the admin form; if the form refuses, set it with SQL: `UPDATE events SET starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' WHERE id = '<id>';`.
5. Student: reload the home. The survey popup appears. Submit it ("Yes", ratings).
6. Expected: the review appears on the tutor's public profile; the tutor's average/count updated.
7. Clean up the test reviews per 5.4 if the tutor is a real one; leave the finished event as is.

### 5.2 Hidden paid event

1. Admin: create a paid event, hidden: **price 2,000 COP, 1 early-bird slot at 10 %** (so the discounted charge is 1,800; the minimum charge is 1,500). Publish.
2. Account A pays: expected charge **1,800** (early-bird). Account B pays: expected charge **2,000**.
3. Verify for each: webhook processed; registration `Confirmed`; one `EventPayment` row; confirmation email with the right amount.
   ```sql
   SELECT r.status, r.early_bird, r.final_amount, p.amount, p.flag, p.refund_status
   FROM event_registrations r JOIN event_payments p ON p.registration_id = r.id
   WHERE r.event_id = '<id>';
   ```
4. Admin → tab "Pagos": gross **3,800** (1,800 + 2,000), refunds pending 0, refunded 0; Wompi fees listed for both payments; net = gross − Wompi fees − tutor payouts.
5. Account A cancels (≥ 6 h before start), entering refund details. Expected: registration Canceled; payment `refund_status = Pending`; early-bird slot freed.
6. Admin refunds A manually (bank transfer / Wompi dashboard), then clicks "Marcar reembolsado" and confirms with "Sí, ya está reembolsado". Expected totals (gross counts only payments with refund `None`; fees are counted over **all** payments, refunds included):
   - after A cancels (refund `Pending`): gross **2,000**, refunds pending **1,800**, refunded 0;
   - after marking refunded: gross **2,000**, refunded **1,800**, refunds pending **0**;
   - net = 2,000 − Wompi fees of **both** payments (1,800 and 2,000) − tutor payouts.
7. Optional: record a tutor payout and check the net.

### 5.3 Declined card in production

1. With a third account on the paid event, pay with a card that will be declined (use a real card that is certain to decline, e.g. insufficient funds, or cancel at the bank step).
2. Expected: registration stays `PendingPayment`; no `EventPayment` row; no email; retry with a valid card succeeds; if the hold lasted > 30 min and slots are gone, the payment is still honoured (flag `EARLY_BIRD_OVERRUN`, visible in admin, no refund).

### 5.4 Cleaning up test data

Finished hidden test events (for example the §5.1 event, moved to the past) are simply left as they are: hidden and harmless. Do **not** try to cancel them: a finished event only offers "Recordar encuesta" in the admin UI, and cancelling through the API would email registrants and queue refunds. Cancel only the §5.2 paid event, if you want it closed, **before it ends** (cancelling queues a refund for every payment still `None`; refund and mark them).

**Test reviews.** If the test tutor is a real tutor, delete the reviews created by the survey:

```sql
DELETE FROM reviews WHERE event_id = '<event id>';
```

Reviews cascade on event deletion, but a Published event cannot be deleted, so delete the rows explicitly. Then recompute that tutor's stats. The app recomputes `tutor_profiles.review` / `num_review` from all `done` reviews of the tutor whenever **any** review for that tutor is saved (`updateTutorReviewStats`), so the next real review fixes it. To fix it immediately, run the equivalent SQL (same rules: only `status = 'done'` and `rating IS NOT NULL`, rounded to 2 decimals):

```sql
UPDATE tutor_profiles tp
SET review = COALESCE((SELECT round(avg(r.rating)::numeric, 2) FROM reviews r
                       WHERE r.tutor_id = tp.user_id AND r.status = 'done' AND r.rating IS NOT NULL), 0),
    num_review = (SELECT count(*) FROM reviews r
                  WHERE r.tutor_id = tp.user_id AND r.status = 'done' AND r.rating IS NOT NULL)
WHERE tp.user_id = '<tutor user id>';
```

Test registrations/payments are kept (they are an audit trail; events with registrations cannot be hard-deleted). A canceled hidden event is harmless.

---

## 6. Rollback

The feature is additive, so rolling back is a matter of not exposing it:

1. **Hide it:** do not publish events; cancel/unpublish any published ones (cancel queues refunds — handle them manually). With zero published events `/eventos` is empty and no cards appear.
2. **Code rollback:** revert the deploy in Vercel (Promote a previous deployment). The old code ignores the new tables and columns. The new nullable columns do not affect it.
3. **Schema stays.** Do not drop the tables/columns. One caveat: the CHECK `reviews_session_xor_event` requires a session **or** an event on every review. Old code always sets `session_id`, so it passes. If you ever need to remove it: `ALTER TABLE reviews DROP CONSTRAINT reviews_session_xor_event;`.
4. If an in-flight paid checkout exists during a rollback, old webhook code will not recognise `kind = event` intents; reconcile those payments by hand from the Wompi dashboard (look at the `EVT-` references).

---

## 7. Known limits

- **Meet participant cap.** A Google Meet call has a plan-dependent participant cap (typically 100). v1 has no capacity limit on events — keep an eye on registration counts for large events.
- **In-memory rate limiter.** `rateLimit` (register, checkout and cancel-registration share one bucket `events:<userId>`, 10/min in total; the survey has its own bucket `survey:<userId>`, 10/min) is per serverless instance, so it is a soft guard. Its purge also ignores `windowMs` (see `docs/BACKLOG.md`).
- **Refunds are manual.** The app only queues and records them; money is returned by hand and then marked refunded. Admin cancelling an event queues a refund for **every** payment with refund `None`, including those whose owner cancelled < 6 h before start.
- **Emails are fire-and-forget.** They run in `waitUntil` after the response and failures are only logged; a registration is never blocked by email. Missing templates skip them silently (warning).
- **Reminders are manual.** There is no cron; "Recordar evento" and "Recordar encuesta" are admin buttons with cooldowns (1 h and 24 h per registrant).
- **Reviews have no timestamp**, so survey comments in admin are ordered by id, not chronologically.
- **Early-bird overrun is honoured.** A payment approved after its 30-minute hold, when slots are taken, keeps the paid price and is flagged `EARLY_BIRD_OVERRUN` for visibility only.

---

## 8. Testing commands

| Command | What | Needs |
|---|---|---|
| `pnpm test` | Unit/API tests (Jest, mocks) | nothing |
| `pnpm test:integration` | Real-Postgres tests for concurrency, reconcile, review arc/CHECK | A local Postgres (below). **Refuses any non-local host** |
| `pnpm test:e2e` | Playwright against the dev server on port **3100** | Seeded local DB (below), Wompi sandbox keys in `.env` |
| `pnpm exec eslint src e2e` | Lint | nothing |

CI (`.github/workflows`): PRs to `dev` run `pnpm test` and `pnpm test:integration` (postgres:16 service, `INTEGRATION_DATABASE_URL=postgresql://calico:calico@localhost:5432/calico_test`). E2E is not in CI.

### 8.1 Local Postgres for the integration suite

```bash
docker run -d --name calico-pg -p 5433:5432 \
  -e POSTGRES_USER=calico -e POSTGRES_PASSWORD=calico -e POSTGRES_DB=calico_test \
  postgres:16
```

The default URL is `postgresql://calico:calico@localhost:5433/calico_test`. To use another local database set `INTEGRATION_DATABASE_URL`. `globalSetup` validates the host, drops and recreates the `public` schema of that database, runs `prisma db push`, and applies `prisma/sql/reviews_session_xor_event.sql`. It never touches `DATABASE_URL`.

(You can also reuse the docker-compose Postgres from [`docs/LOCAL_DATABASE.md`](../LOCAL_DATABASE.md): it is the same server on 5433 with the `calico_local` database; the suite uses a separate `calico_test` database.)

### 8.2 Local database for E2E

```bash
pnpm exec prisma db push
pnpm exec prisma db execute --file prisma/sql/reviews_session_xor_event.sql   # re-apply after every db push
pnpm db:seed && pnpm db:seed:test
pnpm test:e2e
```

Playwright starts `next dev` on port 3100 itself. The paid flow uses the Wompi widget (a third-party iframe) with the sandbox cards above; if it is brittle the test is marked `fixme` and the paid flow is covered by the manual QA in section 4.

---

## 9. Known quirks

- **`next dev` rewrites `CLAUDE.md`.** Next 16 appends a `nextjs-agent-rules` block to `CLAUDE.md` when the dev server starts. Do not commit it by accident: `git checkout CLAUDE.md` after dev-server/E2E runs. The team can decide to commit the block or disable it with `agentRules: false` in `next.config.mjs`.
- **`db push` removes the CHECK constraint** (section 2.4). Re-apply it after any `db push`.
- **Which unique constraint fired.** Code that needs to know *which* unique constraint fired must read `meta.driverAdapterError.cause.constraint` (Prisma 7 + `pg` adapter), as `event-admin.service` does; `meta.target` is not populated. Handlers that only check `err.code === 'P2002'` are fine.
- **Prisma 7 blocks `--force-reset` / `--accept-data-loss` for AI agents**; the integration `globalSetup` resets the schema with plain SQL instead.
- **`meetingUrl` is private.** Public endpoints never return it; only Confirmed registrants, the event's tutors, and admins see it.
