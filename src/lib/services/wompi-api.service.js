/**
 * Wompi REST API client — server-side only.
 *
 * All calls use WOMPI_PRIVATE_KEY as a Bearer token so they are never
 * exposed to the browser. The public key is only used in the widget.
 *
 * Reference: https://docs.wompi.co/docs/colombia/recursos-del-api
 */

import crypto from 'crypto';
import * as Sentry from '@sentry/nextjs';

const WOMPI_API_BASE = 'https://production.wompi.co/v1';
const WOMPI_API_BASE_SANDBOX = 'https://sandbox.wompi.co/v1';

/** Per-attempt timeout for a transaction lookup. */
const REQUEST_TIMEOUT_MS = 10_000;
/** Attempts before a transaction lookup is given up as PROVIDER_UNAVAILABLE. */
const DEFAULT_ATTEMPTS = 3;
/** Back-off between attempts: delay × attempt number (400 ms, 800 ms, …). */
const DEFAULT_RETRY_DELAY_MS = 400;
/** HTTP statuses that mean "Wompi is having trouble", not "this request is wrong". */
const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Sandbox vs production follows the private key, not NODE_ENV: Vercel preview
 * builds run with NODE_ENV=production but carry test keys, and a test-key
 * transaction only exists in the sandbox API.
 */
export function getBaseUrl() {
  const key = process.env.WOMPI_PRIVATE_KEY || '';
  return key.startsWith('prv_test_') ? WOMPI_API_BASE_SANDBOX : WOMPI_API_BASE;
}

function getPrivateKey() {
  const key = process.env.WOMPI_PRIVATE_KEY;
  if (!key) throw new Error('[wompi-api] WOMPI_PRIVATE_KEY is not configured');
  return key;
}

function sleep(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/**
 * The lookup failed for a reason that is Wompi's, not ours (5xx, 429, network
 * error, timeout). Callers must treat the transaction as unknown — NOT as
 * failed — because the money may already be charged.
 */
function providerUnavailable(transactionId, detail, attempts, status) {
  const err = new Error(
    `[wompi-api] Wompi unavailable after ${attempts} attempt(s) for ${transactionId}: ${detail}`,
  );
  err.code = 'PROVIDER_UNAVAILABLE';
  err.retryable = true;
  if (status) err.status = status;
  return err;
}

/** HTTP statuses Wompi uses when it rejects the key itself (wrong environment, unknown token). */
const KEY_REJECTED_STATUSES = new Set([401, 403]);

/** One HTTP attempt. Network errors and timeouts reject with `transient = true`. */
async function requestTransaction(url, privateKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: 'GET',
      headers: {
        ...(privateKey ? { Authorization: `Bearer ${privateKey}` } : {}),
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
  } catch (err) {
    const wrapped = err?.name === 'AbortError' ? new Error('[wompi-api] Request timed out') : err;
    wrapped.transient = true;
    throw wrapped;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch a transaction from Wompi using the server-side private key.
 * This is the authoritative source of truth for a payment status.
 *
 * Transient failures (5xx, 429, timeouts, network errors) are retried a few
 * times with a short back-off: on 2026-10-09 a single Wompi HTTP 500 during
 * confirm-payment lost an approved payment. After the last attempt the error
 * carries `code = 'PROVIDER_UNAVAILABLE'` and `retryable = true` so callers
 * can keep the transaction recoverable instead of reporting it as failed.
 *
 * @param {string} transactionId - Wompi transaction ID (e.g. "txn_xxx")
 * @param {{ attempts?: number, retryDelayMs?: number }} [options]
 * @returns {Promise<object>} Wompi transaction object
 * @throws {Error} `code = 'NOT_FOUND'` (404, never retried), a plain error for
 *   other 4xx, or `code = 'PROVIDER_UNAVAILABLE'` once the retries are exhausted
 */
export async function fetchTransaction(
  transactionId,
  {
    attempts = DEFAULT_ATTEMPTS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    allowUnauthenticatedFallback = true,
    reference = null,
    since = null,
  } = {},
) {
  const privateKey = getPrivateKey();
  const url = `${getBaseUrl()}/transactions/${encodeURIComponent(transactionId)}`;
  try {
    return await fetchTransactionWithKey(url, privateKey, transactionId, { attempts, retryDelayMs });
  } catch (err) {
    if (err.code === 'NOT_FOUND') throw err;

    // Second, still authenticated: search by reference with the same key and
    // keep the entry with this exact id. Verified 2026-10-17: Wompi answered
    // HTTP 500 to the keyed GET /transactions/:id of an approved CARD charge
    // (every time, hours later) while the keyed search by reference returned
    // it — same key, same merchant. Only used when the caller knows the
    // reference (confirm-payment, webhook, reconcile).
    if (reference) {
      const byReference = await fetchTransactionByReferenceWithKey(privateKey, transactionId, reference, since);
      if (byReference) {
        console.warn(
          `[wompi-api] Keyed lookup of ${transactionId} failed (HTTP ${err.status ?? 'n/a'}, ${err.code ?? 'no code'}); ` +
          `verified with the keyed search by reference ${reference} instead (known Wompi 500 on GET /transactions/:id).`,
        );
        Sentry.withScope((scope) => {
          scope.setTag('service', 'wompi');
          scope.setTag('issue_type', 'keyed_lookup_by_reference');
          scope.setLevel('warning');
          scope.setFingerprint(['wompi', 'keyed-lookup-by-reference']);
          scope.setContext('wompi_lookup', { transactionId, reference, status: err.status ?? null, code: err.code ?? null });
          Sentry.captureMessage('[wompi-api] Transaction verified through the keyed search by reference');
        });
        return byReference;
      }
    }

    if (!allowUnauthenticatedFallback) throw err;
    // Last resort. Wompi still answers GET /transactions/:id without a key
    // (verified 2026-10-12: the production lookup of an approved transaction
    // answered 200 unauthenticated while the configured key was rejected).
    // The data still comes from Wompi over TLS — nothing a client can forge —
    // so an approved payment is not lost because of a bad key or a 5xx on
    // the authenticated path. Loud warning: the key must still be fixed.
    const fallback = await fetchTransactionUnauthenticated(url);
    if (!fallback) throw err;
    // Same transaction, same second, answered without a key: Wompi is up, so
    // a 5xx/401/403 on the keyed path points at the key or the merchant's
    // keyed access, not an outage. GET /api/health/wompi says which.
    console.warn(
      `[wompi-api] Authenticated lookup of ${transactionId} failed ` +
      `(HTTP ${err.status ?? 'n/a'}, ${err.code ?? 'no code'}); verified through the unauthenticated lookup instead. ` +
      'Wompi is up, so check WOMPI_PRIVATE_KEY with GET /api/health/wompi and, if the key is accepted there, ' +
      'report the keyed 5xx to Wompi support.',
    );
    Sentry.withScope((scope) => {
      scope.setTag('service', 'wompi');
      scope.setTag('issue_type', KEY_REJECTED_STATUSES.has(err.status) ? 'private_key_rejected' : 'provider_fetch_fallback');
      scope.setLevel('warning');
      scope.setContext('wompi_lookup', { transactionId, status: err.status ?? null, code: err.code ?? null, message: err.message });
      Sentry.captureMessage('[wompi-api] Transaction verified through the unauthenticated fallback');
    });
    return fallback;
  }
}

/** YYYY-MM-DD in UTC, the format Wompi's search accepts. */
function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Keyed search `GET /transactions?reference=…` (Wompi requires a date window
 * and pagination). Returns the entry whose id AND reference match, and only
 * when it carries every field the checkout reads (status, amount_in_cents);
 * anything else → null so the caller falls through to the next step. Never
 * throws.
 */
async function fetchTransactionByReferenceWithKey(privateKey, transactionId, reference, since) {
  try {
    const now = Date.now();
    const sinceMs = since ? new Date(since).getTime() : NaN;
    const from = new Date((Number.isFinite(sinceMs) ? sinceMs : now - 30 * 86_400_000) - 86_400_000);
    const until = new Date(now + 86_400_000);
    const params = new URLSearchParams({
      reference: String(reference),
      from_date: isoDay(from),
      until_date: isoDay(until),
      page: '1',
      page_size: '10',
    });
    const res = await requestTransaction(`${getBaseUrl()}/transactions?${params}`, privateKey);
    if (!res.ok) return null;
    const payload = await res.json();
    const list = Array.isArray(payload?.data) ? payload.data : [];
    const match = list.find((t) => String(t?.id) === String(transactionId) && t?.reference === reference);
    if (!match) return null;
    if (typeof match.status !== 'string' || !Number.isFinite(Number(match.amount_in_cents))) return null;
    return match;
  } catch {
    return null;
  }
}

async function fetchTransactionUnauthenticated(url) {
  try {
    const res = await requestTransaction(url, null);
    if (!res.ok) return null;
    const payload = await res.json();
    return payload?.data ?? null;
  } catch {
    return null;
  }
}

async function fetchTransactionWithKey(url, privateKey, transactionId, { attempts, retryDelayMs }) {
  const maxAttempts = Math.max(1, Number(attempts) || 1);

  let lastDetail = '';
  let lastStatus;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let res;
    try {
      res = await requestTransaction(url, privateKey);
    } catch (err) {
      if (!err.transient) throw err;
      lastDetail = err.message;
      lastStatus = undefined;
      if (attempt < maxAttempts) {
        await sleep(retryDelayMs * attempt);
        continue;
      }
      throw providerUnavailable(transactionId, lastDetail, maxAttempts, lastStatus);
    }

    if (res.status === 404) {
      const err = new Error(`[wompi-api] Transaction ${transactionId} not found`);
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (res.ok) {
      const payload = await res.json();
      return payload.data;
    }

    const body = await res.text().catch(() => '');
    lastDetail = `Wompi returned HTTP ${res.status}: ${body}`;
    lastStatus = res.status;

    if (!TRANSIENT_STATUSES.has(res.status)) {
      const err = new Error(`[wompi-api] ${lastDetail}`);
      err.status = res.status;
      throw err;
    }
    if (attempt < maxAttempts) {
      await sleep(retryDelayMs * attempt);
    }
  }

  throw providerUnavailable(transactionId, lastDetail, maxAttempts, lastStatus);
}

/**
 * Check that WOMPI_PRIVATE_KEY is accepted by the Wompi environment it points
 * to, for the health endpoint: a lookup of a transaction that cannot exist
 * answers 404 with a valid key, and 401/403 with a key Wompi rejects (wrong
 * environment, unknown merchant token). Never throws.
 *
 * @returns {Promise<{ ok: boolean, environment: 'sandbox'|'production', status: number|null, reason: string|null }>}
 */
export async function verifyPrivateKey() {
  const environment = getBaseUrl() === WOMPI_API_BASE_SANDBOX ? 'sandbox' : 'production';
  let privateKey;
  try {
    privateKey = getPrivateKey();
  } catch (err) {
    return { ok: false, environment, status: null, reason: err.message };
  }
  try {
    const res = await requestTransaction(`${getBaseUrl()}/transactions/health-check-does-not-exist`, privateKey);
    if (res.status === 404) return { ok: true, environment, status: 404, reason: null };
    const body = await res.text().catch(() => '');
    let reason = body;
    try { reason = JSON.parse(body)?.error?.reason ?? body; } catch { /* keep raw body */ }
    return { ok: false, environment, status: res.status, reason: String(reason).slice(0, 200) };
  } catch (err) {
    return { ok: false, environment, status: null, reason: err.message };
  }
}

/** Value at a dotted path inside the event's `data` ("transaction.id" → data.transaction.id). */
function readEventProperty(data, path) {
  if (typeof path !== 'string' || !path) return undefined;
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), data);
}

/**
 * Verify a Wompi webhook event signature.
 *
 * Wompi computes the checksum as:
 *   SHA-256( <values of signature.properties, in order> + timestamp + eventsSecret )
 * where each property is a path inside `data` (today "transaction.id",
 * "transaction.status", "transaction.amount_in_cents"). Wompi says the list
 * can vary, so it is read from every event — never hardcoded — and the
 * digest is sent in uppercase hex.
 *
 * Until 2026-10-22 this hardcoded id + status + amount + CURRENCY and compared
 * case-sensitively: no real event ever matched, every webhook got a 401 and
 * the server-side safety net never ran (an approved charge whose browser
 * confirmation did not complete was lost).
 *
 * Reference: https://docs.wompi.co/docs/colombia/eventos/
 *
 * @param {object} eventBody - Parsed JSON body of the webhook event
 * @param {string} eventsSecret - WOMPI_EVENTS_SECRET environment variable
 * @returns {boolean}
 */
export function verifyEventChecksum(eventBody, eventsSecret) {
  try {
    const properties = eventBody?.signature?.properties;
    const timestamp = eventBody?.timestamp;
    const receivedChecksum = eventBody?.signature?.checksum;

    if (!receivedChecksum || !timestamp || !eventsSecret) return false;
    if (!Array.isArray(properties) || properties.length === 0) return false;

    const values = properties.map((path) => readEventProperty(eventBody.data, path));
    if (values.some((value) => value === undefined || value === null)) return false;

    const raw = [...values.map(String), String(timestamp), eventsSecret].join('');
    const computed = crypto.createHash('sha256').update(raw).digest('hex');

    const a = Buffer.from(computed);
    const b = Buffer.from(String(receivedChecksum).toLowerCase());
    if (a.length !== b.length) return false;

    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
