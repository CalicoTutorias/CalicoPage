/**
 * AdminFinanceService — frontend
 *
 * Finance ledger (libro de movimientos) for the admin: settings, accounts,
 * categories, summary, entries, proofs and session refunds. Every method
 * resolves to `{ success, ...data, error, code, rule, field }` and never throws.
 *
 * Backend: /api/admin/finance/{settings,accounts[/:id],categories[/:id],summary,
 *          entries[/:id/reverse|/:id/proof],proofs/presigned-url,session-refunds}
 */

import { authFetch, authFetchBlob } from '../authFetch';

const API_BASE_URL = process.env.API_URL || '/api';
const BASE = `${API_BASE_URL}/admin/finance`;

const send = (url, method, body) =>
  authFetch(url, { method, ...(body !== undefined && { body: JSON.stringify(body) }) });

function shape({ ok, status, data }, fields = []) {
  if (ok && data?.success) {
    const out = { success: true };
    for (const f of fields) out[f] = data[f];
    return out;
  }
  return {
    success: false,
    error: status === 429 ? null : data?.error || null,
    code: data?.code,
    rule: data?.rule,
    field: data?.field,
    status,
  };
}

const query = (params) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  const s = qs.toString();
  return s ? `?${s}` : '';
};

class AdminFinanceServiceClass {
  async getSettings() {
    return shape(await authFetch(`${BASE}/settings`), ['settings', 'accounts', 'categories', 'cutoffLocked']);
  }

  async updateSettings(payload) {
    return shape(await send(`${BASE}/settings`, 'PUT', payload), ['settings', 'accounts', 'categories', 'cutoffLocked']);
  }

  async createAccount(payload) {
    return shape(await send(`${BASE}/accounts`, 'POST', payload), ['account']);
  }

  async updateAccount(id, payload) {
    return shape(await send(`${BASE}/accounts/${id}`, 'PATCH', payload), ['account']);
  }

  async createCategory(payload) {
    return shape(await send(`${BASE}/categories`, 'POST', payload), ['category']);
  }

  async updateCategory(id, payload) {
    return shape(await send(`${BASE}/categories/${id}`, 'PATCH', payload), ['category']);
  }

  async getSummary({ from, to } = {}) {
    return shape(await authFetch(`${BASE}/summary${query({ from, to })}`), ['summary']);
  }

  async listEntries(filters = {}) {
    return shape(await authFetch(`${BASE}/entries${query(filters)}`), ['items', 'total']);
  }

  /** CSV of the filtered ledger, as a Blob. */
  async exportEntriesCsv(filters = {}) {
    const { ok, status, blob } = await authFetchBlob(`${BASE}/entries${query({ ...filters, format: 'csv' })}`);
    return ok ? { success: true, blob } : { success: false, status };
  }

  async createEntry(payload) {
    return shape(await send(`${BASE}/entries`, 'POST', payload), ['entries']);
  }

  async reverseEntry(id, reason) {
    return shape(await send(`${BASE}/entries/${id}/reverse`, 'POST', { reason }), ['entries']);
  }

  async getEntryProofUrl(id) {
    return shape(await authFetch(`${BASE}/entries/${id}/proof`), ['url']);
  }

  /**
   * Presign → PUT to S3. Resolves to `{ success, s3Key }`; the key is then sent
   * with the action that needs the proof (the server checks it).
   */
  async uploadProof(file) {
    const presign = await send(`${BASE}/proofs/presigned-url`, 'POST', { mimeType: file.type, fileSize: file.size });
    const shaped = shape(presign, ['uploadUrl', 's3Key', 'contentType']);
    if (!shaped.success) return shaped;
    try {
      const res = await fetch(shaped.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': shaped.contentType, 'x-amz-tagging': 'status=unconfirmed' },
        body: file,
      });
      if (!res.ok) return { success: false, code: 'UPLOAD_FAILED', status: res.status };
    } catch {
      return { success: false, code: 'UPLOAD_FAILED' };
    }
    return { success: true, s3Key: shaped.s3Key };
  }

  async listSessionRefunds() {
    return shape(await authFetch(`${BASE}/session-refunds`), ['pending', 'refunded']);
  }

  async refundSessionPayment(payload) {
    return shape(await send(`${BASE}/session-refunds`, 'POST', payload), ['refund']);
  }
}

export const AdminFinanceService = new AdminFinanceServiceClass();
export default AdminFinanceService;
