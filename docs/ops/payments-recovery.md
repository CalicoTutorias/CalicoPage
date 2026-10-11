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

## What the code does now (so this is rare)

| Layer | Behaviour |
|---|---|
| `wompi-api.service.fetchTransaction` | Retries 5xx / 429 / timeout / network errors 3× (400 ms, 800 ms back-off), then throws `PROVIDER_UNAVAILABLE` (`retryable: true`). 404 and other 4xx are never retried. |
| Webhook | Answers **503** when the lookup fails → Wompi re-sends the event 30 min, 3 h and 24 h later (only a 200 stops the retries). |
| confirm-payment | Pins `metadata.pendingTransactionId` on the student's intent, reports `provider_fetch_error` to Sentry and answers `503 PROVIDER_UNAVAILABLE`. |
| Browser (`PaymentService.confirmWompiPayment`) | Retries 4× (2 s, 4 s, 6 s). On any confirmation failure after an approved charge it shows "Recibimos tu pago, pero la sesión no quedó registrada", the reference and a **WhatsApp button to support** prefilled with the reference — never the technical error. The form **stays locked** so the student cannot pay twice. |
| Admin | `POST /api/admin/payments/reconcile` replays the transaction once Wompi is back (below). |

## Detecting a lost payment

- Sentry: `service:wompi issue_type:provider_fetch_error` (confirm-payment or webhook).
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
   - `409 SESSION_CONFLICT | OUTSIDE_AVAILABILITY | MAX_SESSIONS_REACHED` →
     paid but the slot can no longer be honoured: refund from Wompi and offer
     another slot.
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

## What to tell the student

Approved charge, session later created by the replay: the session exists in
their history with the original date; nothing else to do on their side.

Approved charge that cannot be honoured (slot gone, duplicate): the refund is
issued from the Wompi dashboard; the reference and transaction id identify it.
