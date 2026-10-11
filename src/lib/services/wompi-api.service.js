/**
 * Wompi REST API client — server-side only.
 *
 * All calls use WOMPI_PRIVATE_KEY as a Bearer token so they are never
 * exposed to the browser. The public key is only used in the widget.
 *
 * Reference: https://docs.wompi.co/docs/colombia/recursos-del-api
 */

import crypto from 'crypto';

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

/** One HTTP attempt. Network errors and timeouts reject with `transient = true`. */
async function requestTransaction(url, privateKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${privateKey}`,
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
  { attempts = DEFAULT_ATTEMPTS, retryDelayMs = DEFAULT_RETRY_DELAY_MS } = {},
) {
  const privateKey = getPrivateKey();
  const url = `${getBaseUrl()}/transactions/${encodeURIComponent(transactionId)}`;
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
 * Verify a Wompi webhook event signature.
 *
 * Wompi computes the checksum as:
 *   SHA-256( transactionId + status + amountInCents + currency + timestamp + eventsSecret )
 * and sends it in the "checksum" field inside the event envelope.
 *
 * Reference: Wompi Events documentation — "Verificación de firma"
 *
 * @param {object} eventBody - Parsed JSON body of the webhook event
 * @param {string} eventsSecret - WOMPI_EVENTS_SECRET environment variable
 * @returns {boolean}
 */
export function verifyEventChecksum(eventBody, eventsSecret) {
  try {
    const tx = eventBody?.data?.transaction ?? {};
    const timestamp = eventBody?.timestamp;
    const receivedChecksum = eventBody?.signature?.checksum;

    if (!receivedChecksum || !timestamp) return false;

    // Properties specified by Wompi for the checksum (in this order)
    const raw = [
      tx.id ?? '',
      tx.status ?? '',
      String(tx.amount_in_cents ?? ''),
      tx.currency ?? '',
      String(timestamp),
      eventsSecret,
    ].join('');

    const computed = crypto.createHash('sha256').update(raw).digest('hex');

    const a = Buffer.from(computed);
    const b = Buffer.from(receivedChecksum);
    if (a.length !== b.length) return false;

    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
