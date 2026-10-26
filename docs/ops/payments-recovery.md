# Recovering a Wompi payment that never became a session

An approved Wompi charge becomes a `Payment` + `Session` only after the app
verifies the transaction against Wompi's API with the private key
(`GET /v1/transactions/:id`). Two callers do that: the student's browser
(`POST /api/payments/confirm-payment`) and Wompi's webhook
(`POST /api/payments/webhook`). If Wompi's API is down for both, the money is
charged and **nothing exists on our side**.

That is what happened on **2026-10-09 20:55 (Bogotá)**: Wompi answered
HTTP 500 to the verification, confirm-payment failed, the student retried the
booking (a second intent), and no payment, session or notification was ever
written. The intents are still in `payment_intents` with `consumed_at = NULL`.

A third shape, on **2026-10-17**: the verification worked (through the
unauthenticated fallback after the keyed lookup got HTTP 500), but
`createSession` refused the paid booking with `INVALID_TIMES` — the slot
started at a minute outside `:00 :10 :20 :30 :40 :45 :50`. Root cause: the
default "available" calendar sync imported Google events without snapping
them to the slot marks, so the UI offered slots the server rejects, and
create-intent did not run the slot rules before charging. The route answered
a bare 500 with no Sentry event.

A fourth shape, on **2026-10-22** (reference `TXN-1792682897687-dhi2pobcz`):
the charge was approved in Wompi but the browser never confirmed it — the
intent has no `pendingTransactionId`, so confirm-payment never got an
APPROVED answer (most likely a PSE/Nequi charge the widget reported as
`PENDING`, which showed "error, try again" and unlocked the form). The webhook should have booked it, but
**every webhook had been rejected with 401 since 2026-06-17**:
`verifyEventChecksum` hashed `id + status + amount + currency` and compared
case-sensitively, while Wompi signs the values listed in
`signature.properties` (no currency) and sends uppercase hex. So the
server-side safety net never ran, and no `payment_failed` notification was
ever created. Fixed: the checksum follows `signature.properties` and compares
case-insensitively; confirm-payment answers `202 PAYMENT_PENDING` for a
pending charge (pinning the transaction id) and the form keeps itself locked
showing "payment in progress" while it polls.

## What the code does now (so this is rare)

| Layer | Behaviour |
|---|---|
| create-intent | Runs every booking rule (`sessionService.assertSlotBookable`: duration, start minute, availability, max/day, overlap) **before** minting the intent. A refusal answers `409 <code>` and nothing is charged. |
| Calendar sync ("available" mode) | Snaps imported events to the slot marks (same as "busy" mode). |
| Paid fulfilment (`bookPaidSession`) | `relaxSlotPolicy`: slot-policy refusals (`INVALID_TIMES`, `INVALID_DURATION`, `OUTSIDE_AVAILABILITY`, `MAX_SESSIONS_REACHED`) no longer block a charged booking — the session is created and Sentry gets a warning `issue_type:paid_booking_outside_slot_policy`. Only `SESSION_CONFLICT`, `SELF_BOOKING`, `TUTOR_NOT_APPROVED` still refuse. |
| confirm-payment / webhook on a fulfilment failure | Pin `pendingTransactionId`, Sentry `issue_type:paid_not_booked` (fatal, one issue per transaction via fingerprint) for the codes in `src/lib/payments/booking-refusals.js`; anything else is `fulfilment_error` and confirm-payment answers `503 retryable` so the browser retries. |
| `wompi-api.service.fetchTransaction` | Retries 5xx / 429 / timeout / network errors 3× (400 ms, 800 ms back-off), then throws `PROVIDER_UNAVAILABLE` (`retryable: true`). 404 and other 4xx are never retried. |
| `fetchTransaction` fallbacks | If the keyed `GET /transactions/:id` still fails (not 404) and the caller knows the reference: keyed `GET /transactions?reference=…` keeping the entry with the same id (Sentry warning `keyed_lookup_by_reference`). Only then the unauthenticated lookup. 2026-10-17: Wompi answered 500 to the keyed lookup by id of an approved CARD charge every time, while the keyed search by reference returned it with the same key — a Wompi bug, ticket opened. |
| Webhook signature | `verifyEventChecksum` hashes the values named in the event's `signature.properties` + timestamp + `WOMPI_EVENTS_SECRET` and compares case-insensitively. A Sentry `issue_type:invalid_signature` on real traffic means the secret in Vercel is wrong, not an attack. |
| Pending charge (PSE / Nequi) | confirm-payment pins `pendingTransactionId` and answers `202 PAYMENT_PENDING`; the form shows "payment in progress", stays locked and polls ~2 min; the webhook books it when the bank approves. |
| Webhook | Answers **503** when the lookup fails → Wompi re-sends the event 30 min, 3 h and 24 h later (only a 200 stops the retries). |
| confirm-payment | Pins `metadata.pendingTransactionId` on the student's intent, reports `provider_fetch_error` to Sentry and answers `503 PROVIDER_UNAVAILABLE`. |
| Browser (`PaymentService.confirmWompiPayment`) | Retries 4× (2 s, 4 s, 6 s). On any confirmation failure after an approved charge it shows "Recibimos tu pago, pero la sesión no quedó registrada", the reference and a **WhatsApp button to support** prefilled with the reference — never the technical error. The form **stays locked** so the student cannot pay twice. |
| Admin | `POST /api/admin/payments/reconcile` replays the transaction once Wompi is back (below). |

## First check: is WOMPI_PRIVATE_KEY accepted?

On 2026-10-12 a second approved payment failed to confirm while Wompi's
**unauthenticated** `GET /transactions/:id` answered 200: the API was fine,
the configured key was not. `GET /api/health/wompi` (logged in) now reports
`privateKey: { ok, environment, status, reason }` — `ok: false` with
`status 401` means the key belongs to the other environment (test key in
production or vice-versa), `403` an unknown/insufficient token. Fix the
variable in Vercel with the production private key from the Wompi dashboard
and redeploy. Meanwhile `fetchTransaction` falls back to the unauthenticated
lookup (Sentry warning `private_key_rejected`), so confirmations and the
reconcile endpoint keep working.

## Detecting a lost payment

- Sentry: `service:wompi issue_type:provider_fetch_error` (verification failed) or
  `issue_type:paid_not_booked` / `fulfilment_error` (verified, but no session).
- Vercel logs: `confirm-payment` answering 503, or `/api/payments/webhook` answering 503.
- DB: session intents with `consumed_at IS NULL` older than a few minutes whose
  metadata carries `pendingTransactionId`, or any unconsumed intent a student
  says they paid:

```sql
SELECT reference, created_at, metadata->>'studentId' AS student,
       metadata->>'startTimestamp' AS session_start,
       metadata->>'pendingTransactionId' AS pending_tx
FROM payment_intents
WHERE consumed_at IS NULL AND kind = 'session'
  AND created_at >= now() - interval '7 days'
ORDER BY created_at DESC;
```

## Replaying the transaction

1. **Find the Wompi transaction id.** In the Wompi dashboard search by the
   intent `reference` (`TXN-…`). Check its status: only `APPROVED` can be
   replayed. If the student retried the booking there may be two references —
   replay only the approved one(s); a second approved charge for the same
   slot must be refunded from Wompi, not booked twice.
   If confirm-payment managed to pin the id, the intent's
   `metadata.pendingTransactionId` already has it and step 2 can use the
   reference alone.
2. **Call the admin endpoint** as an `ADMIN` user (JWT from the admin app's
   `localStorage.calico_auth_token`):

```bash
curl -X POST https://calico-tutorias.com/api/admin/payments/reconcile \
  -H "Authorization: Bearer <admin JWT>" \
  -H "Content-Type: application/json" \
  -d '{"transactionId":"<wompi transaction id>"}'
# or, when confirm-payment pinned the id on the intent:
#  -d '{"reference":"TXN-1791597028334-gsgqoizoy"}'
```

3. **Read the outcome.**
   - `FULFILLED` → session + payment created, the student and tutor got the
     normal notifications, the intent is consumed. Done.
   - `ALREADY_PROCESSED` → the payment already existed (webhook retry won the
     race). Nothing to do.
   - `NOT_APPROVED` → Wompi says the charge is not approved
     (`DECLINED`/`ERROR`/`PENDING`). Nothing to book; tell the student.
   - `409 SESSION_CONFLICT` (or `SELF_BOOKING` / `TUTOR_NOT_APPROVED`) →
     paid but the slot can no longer be honoured: refund from Wompi and offer
     another slot. Slot-policy codes no longer refuse a paid replay.
   - `409 AMOUNT_MISMATCH` → the charge does not match the frozen price;
     review manually before anything else.
   - `503 PROVIDER_UNAVAILABLE` → Wompi is still down, retry later.

Every successful call is audit-logged (`PAYMENT_RECONCILE`) with the outcome
and the created ids.

## Alternative: ask the student to book again

When replaying is not wanted (e.g. you prefer the student to go through the
page again so the fix is verified end to end), **refund the approved charge
in Wompi first** and only then ask them to book again — the widget approved
the first charge, so a new booking is a second charge. The attachments must be
uploaded again: the S3 keys in the old intent are never reused.

## Re-booked with a 100 % coupon, but the money was really collected

When the student is re-booked through the page with a courtesy coupon (so
they upload their material again and the fix is verified end to end), the
new payment row is `amount 0` with the whole list price as a discount
absorbed by Calico — the dashboard would show the session as a loss, while
Wompi did collect the original charge. Make the books match the money:

1. Wait for the student's booking (session + `paid` payment with amount 0).
2. Get the Wompi transaction id of the **original approved charge** (dashboard,
   search by the lost intent's reference).
3. Call, as an `ADMIN` user:

```bash
curl -X POST https://calico-tutorias.com/api/admin/payments/record-external-charge \
  -H "Authorization: Bearer <admin JWT>" -H "Content-Type: application/json" \
  -d '{"sessionId":"<new session id>","wompiId":"<original Wompi transaction id>"}'
# or {"paymentId":"<payment id>","wompiId":"..."}
```

The transaction is verified against Wompi (must be `APPROVED` for exactly
the list price). On success the payment becomes the normal charge (amount =
list price, no discount, linked to the Wompi id), the coupon use is released
and the lost intent is marked consumed, so it disappears from the lost-payment
query above. Deactivate the one-off coupon afterwards from `/home/admin/coupons`.

## What to tell the student

Approved charge, session later created by the replay: the session exists in
their history with the original date; nothing else to do on their side.

Approved charge that cannot be honoured (slot gone, duplicate): the refund is
issued from the Wompi dashboard; the reference and transaction id identify it.
