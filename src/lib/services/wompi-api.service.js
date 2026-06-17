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

function getBaseUrl() {
  return process.env.NODE_ENV === 'production' ? WOMPI_API_BASE : WOMPI_API_BASE_SANDBOX;
}

function getPrivateKey() {
  const key = process.env.WOMPI_PRIVATE_KEY;
  if (!key) throw new Error('[wompi-api] WOMPI_PRIVATE_KEY is not configured');
  return key;
}

/**
 * Fetch a transaction from Wompi using the server-side private key.
 * This is the authoritative source of truth for a payment status.
 *
 * @param {string} transactionId - Wompi transaction ID (e.g. "txn_xxx")
 * @returns {Promise<object>} Wompi transaction object
 * @throws {Error} if the request fails or the transaction is not found
 */
export async function fetchTransaction(transactionId) {
  const privateKey = getPrivateKey();
  const url = `${getBaseUrl()}/transactions/${encodeURIComponent(transactionId)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${privateKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('[wompi-api] Request timed out');
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 404) {
    const err = new Error(`[wompi-api] Transaction ${transactionId} not found`);
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`[wompi-api] Wompi returned HTTP ${res.status}: ${body}`);
  }

  const payload = await res.json();
  return payload.data;
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
