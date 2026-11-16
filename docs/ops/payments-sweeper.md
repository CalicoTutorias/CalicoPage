# Payment sweeper

A charged payment becomes a session (or an event registration) only when
something confirms it: the student's browser (`confirm-payment`) or Wompi's
webhook. Card payments are confirmed in the widget; **PSE and Nequi are
asynchronous** and depend on the webhook alone.

In November 2026 we found students who had paid by PSE/Nequi and never got
their tutoring session, for weeks, with no alert at all. Wompi had no events
URL configured and `WOMPI_EVENTS_SECRET` was missing, so the webhook never
ran. A webhook that never arrives produces no error anywhere: the only trace
was a `payment_intents` row with `consumed_at IS NULL`, which looks exactly
like an abandoned checkout until you ask Wompi.

The configuration is fixed. The sweeper is the safety net that detects and
repairs the gap whatever its cause (webhook down or misconfigured, student
closed the tab, a bug in a confirmation path).

## How it works

```
Apps Script (every 10 min) ──POST + x-admin-secret──▶ /api/jobs/reconcile-payments
                                                        │ payment-sweeper.service
                                                        ├─ unconsumed intents, 10 min – 48 h old
                                                        ├─ Wompi: GET /transactions?reference=…
                                                        ├─ APPROVED → guards → reconcileTransaction
                                                        ├─ metadata.sweep ← result
                                                        └─ Sentry alert (rescued / paid not booked)
        └─ non-200, FULFILLED or NEEDS_ATTENTION ──▶ MailApp.sendEmail(team)
```

- **Route:** `POST /api/jobs/reconcile-payments`, guarded by
  `requireAdminSecret` (`x-admin-secret` header = `ADMIN_SECRET`). No body.
  `maxDuration` 60 s (Vercel Hobby).
- **Service:** `src/lib/services/payment-sweeper.service.js`
  (`sweepUnconsumedIntents`).
- **Booking path:** `reconcileTransaction` from
  `src/lib/services/payment-reconcile.service.js`, the same one the admin
  endpoint `/api/admin/payments/reconcile` uses. Both kinds (`session`,
  `event`) go through the standard fulfil path, idempotent on the Wompi
  transaction id, so the sweeper can never book a payment twice.

### Which intents each run looks at

- `consumed_at IS NULL`, both kinds, created between **48 hours** and
  **10 minutes** ago. Younger ones are still in the student's hands (widget
  open, bank redirect); older ones are out of scope (Wompi's own webhook
  retries, 30 min / 3 h / 24 h, are long over — use the recovery runbook).
- **Skipped:** intents whose last sweep recorded a final Wompi status
  (`DECLINED`, `VOIDED`, `ERROR`) and intents recorded as `NEEDS_ATTENTION`
  (a human owns them now; see below).
- **At most 40 per run**, least recently checked first: never-checked intents
  (oldest first), then the oldest `checkedAt`. A backlog larger than 40 —
  abandoned checkouts stay unconsumed for 48 h — rotates instead of hiding
  newer intents.
- The run stops starting new intents after **30 s**, so the route answers
  inside its time limit; the rest (`deferred` in the summary) go first next
  time.

### What it does with each intent

1. Searches Wompi by reference (keyed search, window starting a day before
   the intent's creation). Picks the `APPROVED` transaction if there is one,
   otherwise the most recent one.
2. No transaction → `NO_TRANSACTION`. Not approved → `NOT_APPROVED` with
   Wompi's status. Nothing is booked.
3. Approved → two guards first (session intents only). Either one turns the
   result into `NEEDS_ATTENTION` instead of booking:
   - `POSSIBLE_MANUAL_DUPLICATE` — the student already has a live (not
     canceled/rejected) session with the same tutor and course, created after
     the intent and not booked by it. Before the sweeper existed the team
     fixed lost payments by creating a manual session; booking the intent
     would duplicate it. Checked first: it means the student was probably
     served.
   - `SLOT_PASSED` — the paid slot already started. Booking a session that
     already happened is wrong; it needs a refund or a new slot.
4. Otherwise `reconcileTransaction` books it → `FULFILLED`, or
   `ALREADY_PROCESSED` if the payment already existed. A business refusal
   (`SESSION_CONFLICT`, `AMOUNT_MISMATCH`, `INTENT_CONSUMED`…) →
   `NEEDS_ATTENTION` with that code as the reason. A transient failure (Wompi
   unreachable, database hiccup, unexpected exception) → `ERROR`, retried
   next run.

One failing intent never stops the run.

## The `metadata.sweep` contract

Every checked intent gets its latest result written to
`payment_intents.metadata.sweep` (JSONB merge: every other metadata key —
pricing snapshot, `pendingTransactionId`… — is kept; the previous `sweep` is
replaced). The admin panel reads this shape; keep it stable:

```js
metadata.sweep = {
  status: 'APPROVED' | 'PENDING' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'NO_TRANSACTION' | null,
  transactionId: string | null,
  outcome: 'FULFILLED' | 'ALREADY_PROCESSED' | 'NOT_APPROVED' | 'NO_TRANSACTION' | 'NEEDS_ATTENTION' | 'ERROR',
  reason: string | null,
  checkedAt: string, // ISO 8601, UTC
}
```

- `status` is Wompi's status of the chosen transaction, `NO_TRANSACTION` when
  Wompi has none for the reference, and `null` only when Wompi could not be
  asked (outcome `ERROR` before any transaction was found).
- `transactionId` is the chosen Wompi transaction (`null` with no
  transaction).
- `reason` is set for `NEEDS_ATTENTION` (guard name or reconcile error code)
  and `ERROR` (error code, or the message when there is none); `null`
  otherwise.
- A `FULFILLED` result is written on an intent the booking has just consumed,
  so it stays visible after the fact.

## Reading the outcomes

| Outcome | Meaning | Action |
|---|---|---|
| `FULFILLED` | Approved and booked **by the sweeper**: the webhook and confirm-payment both missed it. Student and tutor got the normal notifications. | Nothing for the student. Find out why the webhook missed it: Wompi events URL, `WOMPI_EVENTS_SECRET` in Vercel, Sentry `issue_type:invalid_signature`. One rescue is a symptom. |
| `ALREADY_PROCESSED` | The payment already existed. | Nothing. |
| `NOT_APPROVED` | `PENDING`: checked again next run. `DECLINED` / `VOIDED` / `ERROR`: final, never checked again. | Nothing. |
| `NO_TRANSACTION` | No Wompi transaction for the reference: an abandoned checkout (or one not paid yet). Checked again until it is 48 h old. | Nothing. |
| `NEEDS_ATTENTION` | **Money taken, nothing booked.** The sweeper will not touch this intent again. | See below. |
| `ERROR` | Could not decide this run (`reason` says why). Retried every run. | Only if it persists: read `reason`; `PROVIDER_UNAVAILABLE` means Wompi is down. |

`NEEDS_ATTENTION` by reason:

- `POSSIBLE_MANUAL_DUPLICATE` — check the session the team created. If it
  covers what the student paid for, the money still has to be linked: follow
  "Re-booked with a 100 % coupon" in
  [payments-recovery.md](payments-recovery.md) if it was booked with a
  courtesy coupon, otherwise refund the duplicate charge. The guard only
  matches sessions under the student's own user (a manual session created for
  a different phone number creates another user and is not detected).
- `SLOT_PASSED` — the student never got the session. Refund from the Wompi
  dashboard, or agree a new slot and re-book it with a courtesy coupon +
  `record-external-charge` (same runbook section).
- `SESSION_CONFLICT`, `SELF_BOOKING`, `TUTOR_NOT_APPROVED` — the slot cannot
  be honoured: refund and offer another slot.
- `AMOUNT_MISMATCH` — the charge does not match the frozen price: review
  before anything else.
- `INTENT_CONSUMED` — a second approved charge for an intent that already
  produced a payment: refund the duplicate.
- `COUPON_LIMIT_EXCEEDED`, `EVENT_REGISTRATION_MISSING` — review and refund.

When the cause is fixed and you want the payment booked after all, call
`POST /api/admin/payments/reconcile` with the reference's transaction id
(`metadata.sweep.transactionId`); it does not apply the sweeper's guards. To
let the sweeper look at the intent again instead, drop its record:

```sql
UPDATE payment_intents SET metadata = metadata - 'sweep' WHERE reference = 'TXN-…';
```

### Sentry

One event per intent, grouped per reference (fingerprint
`payments / payment-sweeper / <issue_type> / <reference>`), tag
`service:wompi`, context `payment_sweep` (reference, transactionId, kind,
amountInCents, status, reason):

| Outcome | Level | `issue_type` |
|---|---|---|
| `FULFILLED` | error | `sweeper_rescued` |
| `NEEDS_ATTENTION` | fatal | `paid_not_booked` (+ tag `reason`) |
| `ERROR` | warning | `sweeper_error` |
| run failed (500) | error | `sweeper_failed` |

## Setup (once)

1. **`ADMIN_SECRET` in Vercel production.** Generate a long random value
   (`openssl rand -hex 32`), add it as `ADMIN_SECRET` in the Vercel project
   (Production) and redeploy. Without it the route answers 500
   (`Server misconfiguration`) and the sweep never runs.
2. Go to [script.google.com](https://script.google.com) → **New project**.
3. **Project Settings → Script Properties** → add `ADMIN_SECRET` with the same
   value. It stays out of the code.
4. Paste `sweeper.gs` (below) and edit `CONFIG`:
   - `SWEEP_URL` → `https://calico-tutorias.com/api/jobs/reconcile-payments`
   - `ALERT_RECIPIENTS` → comma-separated team emails.
5. Run `sweepPayments` once by hand and authorize when prompted; the
   **Executions** tab shows the summary it logged.
6. Run `installTrigger` once. `sweepPayments` now runs every 10 minutes.

Vercel Cron is not an option on Hobby (one run per day at most); the Apps
Script also alerts when the app itself is down.

## sweeper.gs

```javascript
/**
 * Calico — payment sweeper trigger.
 * Every 10 minutes: POST /api/jobs/reconcile-payments with x-admin-secret.
 * Emails the team when the sweep fails (on the change healthy → failing and
 * on recovery, not on every run) and whenever the summary lists a rescued
 * (FULFILLED) or NEEDS_ATTENTION payment. Each of those is listed only once:
 * a rescued intent is consumed and a NEEDS_ATTENTION one is not checked again.
 */
const CONFIG = {
  SWEEP_URL: 'https://TU-DOMINIO/api/jobs/reconcile-payments',
  ALERT_RECIPIENTS: 'calico-tutorias@gmail.com',
};

function sweepPayments() {
  const props = PropertiesService.getScriptProperties();
  const wasHealthy = props.getProperty('lastHealthy') !== 'false';

  let data = null;
  let failure = '';
  try {
    const res = UrlFetchApp.fetch(CONFIG.SWEEP_URL, {
      method: 'post',
      headers: { 'x-admin-secret': props.getProperty('ADMIN_SECRET') || '' },
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code === 200) {
      data = JSON.parse(res.getContentText());
    } else {
      failure = 'HTTP ' + code + ': ' + res.getContentText().slice(0, 500);
    }
  } catch (err) {
    failure = 'No se pudo llamar al barrido: ' + err;
  }

  if (failure) {
    if (wasHealthy) {
      MailApp.sendEmail({
        to: CONFIG.ALERT_RECIPIENTS,
        subject: '🔴 Calico: el barrido de pagos está fallando',
        body:
          'La llamada programada al barrido de pagos falló. Mientras siga así, ' +
          'un pago PSE/Nequi sin webhook no se detecta.\n\n' +
          'Detalle:\n' + failure + '\n\n' +
          'Revisa ADMIN_SECRET (Vercel y Script Properties) y los logs de Vercel.\n' +
          'Endpoint: ' + CONFIG.SWEEP_URL,
      });
    }
    props.setProperty('lastHealthy', 'false');
    return;
  }

  if (!wasHealthy) {
    MailApp.sendEmail({
      to: CONFIG.ALERT_RECIPIENTS,
      subject: '🟢 Calico: el barrido de pagos se recuperó',
      body: 'El barrido de pagos volvió a responder 200.',
    });
  }
  props.setProperty('lastHealthy', 'true');
  console.log(JSON.stringify(data));

  const items = (data.items || []).filter(
    (i) => i.outcome === 'FULFILLED' || i.outcome === 'NEEDS_ATTENTION',
  );
  if (items.length === 0) return;

  const attention = items.filter((i) => i.outcome === 'NEEDS_ATTENTION');
  const line = (i) => '- ' + i.reference + ' (' + i.kind + '): ' + i.outcome + (i.reason ? ' — ' + i.reason : '');
  MailApp.sendEmail({
    to: CONFIG.ALERT_RECIPIENTS,
    subject: attention.length > 0
      ? '🔴 Calico: ' + attention.length + ' pago(s) cobrado(s) sin reservar — revisar'
      : '🟠 Calico: el barrido reservó ' + items.length + ' pago(s) que nadie había confirmado',
    body:
      'Resultado del barrido de pagos:\n\n' + items.map(line).join('\n') + '\n\n' +
      'FULFILLED: el barrido reservó la tutoría; revisa por qué el webhook no llegó.\n' +
      'NEEDS_ATTENTION: hay dinero cobrado sin reservar; sigue docs/ops/payments-sweeper.md.\n',
  });
}

function installTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'sweepPayments')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sweepPayments').timeBased().everyMinutes(10).create();
}
```

## Running it by hand

```bash
curl -X POST https://calico-tutorias.com/api/jobs/reconcile-payments \
  -H "x-admin-secret: <ADMIN_SECRET>"
```

Response:

```json
{
  "success": true,
  "checked": 3,
  "deferred": 0,
  "counts": { "FULFILLED": 1, "ALREADY_PROCESSED": 0, "NOT_APPROVED": 1, "NO_TRANSACTION": 1, "NEEDS_ATTENTION": 0, "ERROR": 0 },
  "items": [{ "reference": "TXN-…", "kind": "session", "outcome": "FULFILLED", "reason": null }]
}
```

`items` lists only `FULFILLED`, `NEEDS_ATTENTION` and `ERROR` results; the
others are only counted.
