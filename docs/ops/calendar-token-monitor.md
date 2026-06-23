# Calico Calendar admin-token monitor

The central Calico calendar authenticates with a Google OAuth **admin refresh
token** (`GOOGLE_ADMIN_REFRESH_TOKEN`). As long as the OAuth consent screen is
published **"In production"** the token is long-lived, but it can still die
(revoked, app flipped back to "Testing", or ~6 months unused). When it dies,
session bookings silently lose their Google Meet link — a client-facing
failure.

This monitor catches that **before a client hits it**: an external Google Apps
Script pings the app's health endpoint every hour and emails the team if the
token stops working (or the app is unreachable).

## How it works

```
Apps Script (hourly trigger)  ──GET──▶  /api/calico-calendar/status
        │                                   (verifyConnection: live probe)
        └─ connected !== true  ──▶  MailApp.sendEmail(team)
```

- **Data source:** `GET /api/calico-calendar/status` returns
  `{ configured, connected, reason, message }`. `connected` comes from a real
  Google Calendar API call (`verifyConnection` in
  `src/lib/services/calico-calendar.service.js`), not just an env-var check.
- **Trigger + alert:** the Apps Script below. It runs on Google's infra, so it
  also alerts if the CalicoPage app itself is down.
- **No spam:** it only emails on a state change (healthy → broken) and again on
  recovery (broken → healthy), tracked via Script Properties.

## Setup (once)

1. Go to [script.google.com](https://script.google.com) → **New project**.
2. Paste `monitor.gs` (below) and edit `CONFIG`:
   - `STATUS_URL` → production URL, e.g. `https://app.calico.../api/calico-calendar/status`
   - `ALERT_RECIPIENTS` → comma-separated team emails.
3. Run `installHourlyTrigger` once and authorize when prompted.
4. Done — `checkCalendarToken` now runs every hour. Use the script's
   **Executions** tab to confirm it's firing.

## monitor.gs

```javascript
/**
 * Calico — Google Calendar admin-token monitor.
 * Hourly health check against the CalicoPage status endpoint; emails the team
 * when the central-calendar token is dead or the app is unreachable.
 */
const CONFIG = {
  // Production health endpoint (added by the fix branch).
  STATUS_URL: 'https://TU-DOMINIO/api/calico-calendar/status',
  // Who gets alerted (comma-separated).
  ALERT_RECIPIENTS: 'calico-tutorias@gmail.com',
};

function checkCalendarToken() {
  const props = PropertiesService.getScriptProperties();
  // Optimistic default so the first broken check always alerts.
  const wasHealthy = props.getProperty('lastHealthy') !== 'false';

  let healthy = false;
  let detail = '';

  try {
    const res = UrlFetchApp.fetch(CONFIG.STATUS_URL, { muteHttpExceptions: true });
    const code = res.getResponseCode();
    if (code === 200) {
      const data = JSON.parse(res.getContentText());
      healthy = data.connected === true;
      detail = data.message || JSON.stringify(data);
    } else {
      detail = `Health endpoint returned HTTP ${code}: ${res.getContentText().slice(0, 300)}`;
    }
  } catch (err) {
    detail = `Could not reach health endpoint: ${err}`;
  }

  if (!healthy && wasHealthy) {
    MailApp.sendEmail({
      to: CONFIG.ALERT_RECIPIENTS,
      subject: '🔴 Calico: el token del Google Calendar central dejó de funcionar',
      body:
        'El monitor detectó que el calendario central de Calico no está conectado.\n\n' +
        'Detalle:\n' + detail + '\n\n' +
        'Acción: regenera GOOGLE_ADMIN_REFRESH_TOKEN (OAuth Playground) y verifica ' +
        'que la app OAuth siga "In production".\n\n' +
        'Endpoint revisado: ' + CONFIG.STATUS_URL,
    });
  } else if (healthy && !wasHealthy) {
    MailApp.sendEmail({
      to: CONFIG.ALERT_RECIPIENTS,
      subject: '🟢 Calico: el token del Google Calendar central se recuperó',
      body: 'El calendario central volvió a conectar correctamente.\n\n' + detail,
    });
  }

  props.setProperty('lastHealthy', String(healthy));
}

function installHourlyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'checkCalendarToken')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkCalendarToken').timeBased().everyHours(1).create();
}
```

## Notes

- The status endpoint is currently **public** (returns only health booleans, no
  secrets/PII). If you want it locked down, guard it with `requireAdminSecret`
  and send the `x-admin-secret` header from the Apps Script.
- **Alternative trigger:** a GitHub Actions scheduled workflow (`on: schedule`)
  hitting the same endpoint also works, but it lives in CI rather than as an
  independent monitor and would email via a separate channel.
- **Fully independent variant:** instead of pinging the app, the Apps Script can
  test the refresh token directly against `https://oauth2.googleapis.com/token`
  (grant_type=refresh_token) with the client id/secret/refresh token stored in
  Script Properties. More robust (works even mid-deploy) but duplicates the
  refresh token, so it must be updated whenever the token is rotated.
```
