/**
 * Finance ledger (libro de movimientos) — business service.
 *
 * Answers three questions the admin dashboard could not:
 *   - Caja: how much money Calico has, per account (Σ IN − Σ OUT since the
 *     opening balance at the cutoff date).
 *   - Por pagar: how much of it belongs to tutors (owed for sessions and
 *     repasos that already happened, plus their share of paid sessions still
 *     to come) and to students with a pending refund.
 *   - Ganancia: what Calico earned in a period — sessions and repasos when
 *     they HAPPEN (fees.js / event-earnings.js), minus 4x1000 and expenses.
 *
 * Automatic entries are projected from the rows that already describe the
 * money (payments, event payments, payouts, refunds) by `syncLedger`, which
 * is idempotent (unique source keys) and runs before every read. Manual
 * entries (opening balance, expenses, other income, transfers, adjustments)
 * are typed in by an admin. Nothing is ever edited or deleted: a mistake is
 * fixed with a REVERSAL.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import * as repo from '../repositories/finance.repository';
import * as s3 from '../s3';
import * as auditService from './admin-audit.service';
import { eventFinance } from './admin-metrics.service';
import { listEventPayouts, listPendingPayoutsByTutor } from './payouts.service';
import { aggregateFinancials, tutorPayout } from '../payments/fees';
import {
  ENTRY_TYPES,
  MANUAL_ENTRY_KINDS,
  PROOF_REQUIRED_KINDS,
  balancesByAccount,
  eventPaymentEntries,
  eventTutorPayoutEntries,
  gmfEntryFor,
  ledgerProfitItems,
  manualEventChargeEntries,
  money,
  reversalOf,
  sessionPaymentEntries,
  withGmf,
} from '../finance/ledger-math';
import {
  FINANCE_PROOF_TYPES,
  MAX_FINANCE_PROOF_SIZE,
  financeProofFolder,
  isFinanceProofKey,
} from '../finance/finance-proof';
import {
  FinanceError, assertAccount, confirmProof, invalid, loadConfig, resolveTransfer,
} from './finance-transfer.service';

export { FinanceError, confirmProof, loadConfig, resolveTransfer };

export const FINANCE_ACTIONS = Object.freeze({
  SETTINGS_UPDATE: 'FINANCE_SETTINGS_UPDATE',
  ACCOUNT_SAVE: 'FINANCE_ACCOUNT_SAVE',
  CATEGORY_SAVE: 'FINANCE_CATEGORY_SAVE',
  ENTRY_CREATE: 'FINANCE_ENTRY_CREATE',
  ENTRY_REVERSE: 'FINANCE_ENTRY_REVERSE',
  SESSION_REFUND: 'FINANCE_SESSION_REFUND',
});

const PROOF_UPLOAD_URL_EXPIRY = 10 * 60;
const PROOF_VIEW_URL_EXPIRY = 5 * 60;

// ─── Configuration ───────────────────────────────────────────────────────

function serializeSettings(config) {
  return {
    configured: config.configured,
    cutoffDate: config.cutoff,
    gmfRate: config.gmfRate,
    wompiAccountId: config.accounts.wompi,
    defaultBankAccountId: config.accounts.bank,
    defaultManualAccountId: config.accounts.manual,
  };
}

export async function getSettings() {
  const [config, categories, entriesCount] = await Promise.all([
    loadConfig(), repo.listCategories(), repo.countEntries(),
  ]);
  return {
    settings: serializeSettings(config),
    accounts: config.accountList,
    categories,
    cutoffLocked: entriesCount > 0,
  };
}

/**
 * Update the ledger settings. The cutoff date can only change while the
 * ledger is empty: moving it later would leave entries before it.
 */
export async function updateSettings({ adminId, data, request }) {
  const current = await loadConfig();
  const patch = { updatedById: adminId };

  if (data.cutoffDate !== undefined) {
    const next = data.cutoffDate ? new Date(data.cutoffDate) : null;
    const changed = (next?.getTime() ?? null) !== (current.cutoff?.getTime() ?? null);
    if (changed && (await repo.countEntries()) > 0) {
      throw new FinanceError('La fecha de corte ya no se puede cambiar: el libro tiene movimientos', 'CUTOFF_LOCKED', { field: 'cutoffDate' });
    }
    if (next && next > new Date()) throw invalid('La fecha de corte no puede ser futura', 'cutoffDate', 'CUTOFF_IN_FUTURE');
    patch.cutoffDate = next;
  }
  if (data.gmfRate !== undefined) {
    const rate = Number(data.gmfRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 0.05) throw invalid('Tasa de 4x1000 inválida', 'gmfRate', 'GMF_RATE_INVALID');
    patch.gmfRate = rate;
  }
  for (const [field, key] of [
    ['wompiAccountId', 'wompiAccountId'],
    ['defaultBankAccountId', 'defaultBankAccountId'],
    ['defaultManualAccountId', 'defaultManualAccountId'],
  ]) {
    if (data[field] !== undefined) {
      await assertAccount(data[field], field);
      patch[key] = data[field];
    }
  }

  await repo.upsertSettings(patch);
  await auditService.logAction({
    adminId, action: FINANCE_ACTIONS.SETTINGS_UPDATE, targetType: 'FinanceSettings', targetId: '1', payload: data, request,
  });
  return getSettings();
}

export async function saveAccount({ adminId, id = null, data, request }) {
  const fields = {};
  if (data.name !== undefined) fields.name = String(data.name).trim();
  if (data.type !== undefined) fields.type = data.type;
  if (data.gmfApplies !== undefined) fields.gmfApplies = Boolean(data.gmfApplies);
  if (data.isActive !== undefined) fields.isActive = Boolean(data.isActive);
  if (fields.name !== undefined && fields.name.length === 0) throw invalid('El nombre es obligatorio', 'name', 'NAME_REQUIRED');

  if (id && fields.isActive === false) {
    const config = await loadConfig();
    if (Object.values(config.accounts).includes(id)) {
      throw invalid('Es una cuenta por defecto: cambia la configuración antes de desactivarla', 'isActive', 'ACCOUNT_IS_DEFAULT');
    }
  }

  let account;
  try {
    account = id ? await repo.updateAccount(id, fields) : await repo.createAccount(fields);
  } catch (err) {
    if (err?.code === 'P2002') throw invalid('Ya existe una cuenta con ese nombre', 'name', 'NAME_TAKEN');
    if (err?.code === 'P2025') throw new FinanceError('Cuenta no encontrada', 'NOT_FOUND');
    throw err;
  }
  await auditService.logAction({
    adminId, action: FINANCE_ACTIONS.ACCOUNT_SAVE, targetType: 'FinanceAccount', targetId: account.id, payload: fields, request,
  });
  return account;
}

export async function saveCategory({ adminId, id = null, data, request }) {
  const fields = {};
  if (data.name !== undefined) fields.name = String(data.name).trim();
  if (data.isActive !== undefined) fields.isActive = Boolean(data.isActive);
  if (fields.name !== undefined && fields.name.length === 0) throw invalid('El nombre es obligatorio', 'name', 'NAME_REQUIRED');
  let category;
  try {
    category = id ? await repo.updateCategory(id, fields) : await repo.createCategory(fields);
  } catch (err) {
    if (err?.code === 'P2002') throw invalid('Ya existe una categoría con ese nombre', 'name', 'NAME_TAKEN');
    if (err?.code === 'P2025') throw new FinanceError('Categoría no encontrada', 'NOT_FOUND');
    throw err;
  }
  await auditService.logAction({
    adminId, action: FINANCE_ACTIONS.CATEGORY_SAVE, targetType: 'ExpenseCategory', targetId: category.id, payload: fields, request,
  });
  return category;
}

// ─── Proofs (comprobantes) ───────────────────────────────────────────────

/** Presigned PUT for a proof. The browser must send `contentType` and `x-amz-tagging: status=unconfirmed`. */
export async function generateProofUploadUrl({ mimeType, fileSize }) {
  const extension = FINANCE_PROOF_TYPES[mimeType];
  if (!extension) throw invalid('Formato no permitido (PNG, JPG, WEBP o PDF)', 'proof', 'PROOF_INVALID_TYPE');
  if (!Number.isInteger(fileSize) || fileSize <= 0 || fileSize > MAX_FINANCE_PROOF_SIZE) {
    throw invalid('El archivo supera 10 MB', 'proof', 'PROOF_TOO_LARGE');
  }
  const s3Key = `${financeProofFolder()}${randomBytes(12).toString('hex')}.${extension}`;
  const uploadUrl = await s3.generateUploadUrl(s3Key, mimeType, {
    expiresIn: PROOF_UPLOAD_URL_EXPIRY,
    contentLength: fileSize,
    tagging: 'status=unconfirmed',
  });
  return { uploadUrl, s3Key, contentType: mimeType };
}

/** Short-lived URL to look at a proof. */
export async function getProofUrl(s3Key) {
  if (!isFinanceProofKey(s3Key)) throw new FinanceError('Comprobante no encontrado', 'NOT_FOUND');
  return s3.generateDownloadUrl(s3Key, PROOF_VIEW_URL_EXPIRY);
}

/** Proof of one entry (its own, or the one of the transfer it was projected from). */
export async function getEntryProofUrl(entryId) {
  const entry = await repo.findEntry(entryId);
  if (!entry?.proofS3Key) throw new FinanceError('Este movimiento no tiene comprobante', 'NOT_FOUND');
  return getProofUrl(entry.proofS3Key);
}

// ─── Projection ──────────────────────────────────────────────────────────

/**
 * Project every automatic entry that is missing. Idempotent and safe to run
 * concurrently (unique source keys + skipDuplicates).
 * @returns {Promise<number>} how many entries were added
 */
export async function syncLedger({ now = new Date() } = {}) {
  const config = await loadConfig();
  if (!config.configured) return 0;
  const ctx = { cutoff: config.cutoff, accounts: config.accounts };

  const [sessions, eventPayments, manualEvents, eventPayouts] = await Promise.all([
    repo.sessionPaymentSources(config.cutoff),
    repo.eventPaymentSources(config.cutoff),
    repo.manualEventChargeSources(config.cutoff),
    repo.eventTutorPayoutSources(config.cutoff),
  ]);

  const projected = withGmf([
    ...sessions.flatMap((r) => sessionPaymentEntries(r, ctx)),
    ...eventPayments.flatMap((r) => eventPaymentEntries(r, ctx)),
    ...manualEvents.flatMap((r) => manualEventChargeEntries(r, ctx)),
    ...eventPayouts.flatMap((r) => eventTutorPayoutEntries(r, ctx)),
  ], { accountsById: config.accountsById, rate: config.gmfRate })
    .filter((e) => e.effectiveAt <= now);

  const existing = await repo.existingSourceKeys(projected.map((e) => e.sourceKey));
  return repo.insertProjectedEntries(projected.filter((e) => !existing.has(e.sourceKey)));
}

async function syncedConfig() {
  const config = await loadConfig();
  if (!config.configured) {
    throw new FinanceError('Configura la fecha de corte y las cuentas antes de usar el libro', 'NOT_CONFIGURED');
  }
  try {
    await syncLedger();
  } catch (err) {
    // A failed projection must not hide what is already recorded.
    console.error('[finance] Ledger sync failed:', err);
  }
  return config;
}

// ─── Manual entries ──────────────────────────────────────────────────────

function parseAmount(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw invalid('El monto debe ser mayor a 0', 'amount', 'AMOUNT_INVALID');
  if (n > 1_000_000_000) throw invalid('Monto demasiado grande', 'amount', 'AMOUNT_TOO_LARGE');
  return money(n);
}

/**
 * Record a manual entry.
 *
 * kind: OPENING_BALANCE | EXPENSE | OTHER_INCOME | ADJUSTMENT | TRANSFER
 * data: { accountId, toAccountId (TRANSFER), amount, effectiveAt, direction (ADJUSTMENT),
 *         categoryId (EXPENSE), description, proofS3Key, excludeFromProfit (OTHER_INCOME) }
 *
 * Outflows from an account with 4x1000 add the GMF entry. The opening
 * balance is dated at the cutoff; everything else on/after it.
 */
export async function createManualEntry({ adminId, kind, data, request, now = new Date() }) {
  if (!MANUAL_ENTRY_KINDS.includes(kind)) throw invalid('Tipo de movimiento inválido', 'kind', 'KIND_INVALID');
  const config = await loadConfig();
  if (!config.configured) throw new FinanceError('Configura la fecha de corte y las cuentas', 'NOT_CONFIGURED');

  const amount = parseAmount(data.amount);
  const account = await assertAccount(data.accountId, 'accountId');
  const description = typeof data.description === 'string' ? data.description.trim().slice(0, 500) || null : null;

  let effectiveAt;
  if (kind === 'OPENING_BALANCE') {
    effectiveAt = config.cutoff;
  } else {
    effectiveAt = data.effectiveAt ? new Date(data.effectiveAt) : now;
    if (Number.isNaN(effectiveAt.getTime())) throw invalid('Fecha inválida', 'effectiveAt', 'DATE_INVALID');
    if (effectiveAt < config.cutoff) throw invalid('La fecha es anterior al corte', 'effectiveAt', 'DATE_BEFORE_CUTOFF');
    if (effectiveAt.getTime() > now.getTime() + 60_000) throw invalid('La fecha no puede ser futura', 'effectiveAt', 'DATE_IN_FUTURE');
  }

  let proofS3Key = null;
  if (PROOF_REQUIRED_KINDS.includes(kind)) proofS3Key = await confirmProof(data.proofS3Key);
  else if (data.proofS3Key) proofS3Key = await confirmProof(data.proofS3Key);

  const base = {
    amount, effectiveAt, description, proofS3Key, createdById: adminId,
    isEstimate: false, excludeFromProfit: false,
  };
  const entries = [];

  switch (kind) {
    case 'OPENING_BALANCE':
      entries.push({ ...base, id: randomUUID(), type: ENTRY_TYPES.OPENING_BALANCE, direction: 'IN', accountId: account.id });
      break;
    case 'EXPENSE': {
      const category = data.categoryId ? await repo.findCategory(data.categoryId) : null;
      if (!category) throw invalid('Selecciona una categoría', 'categoryId', 'CATEGORY_REQUIRED');
      entries.push({ ...base, id: randomUUID(), type: ENTRY_TYPES.EXPENSE, direction: 'OUT', accountId: account.id, categoryId: category.id });
      break;
    }
    case 'OTHER_INCOME':
      entries.push({
        ...base, id: randomUUID(), type: ENTRY_TYPES.OTHER_INCOME, direction: 'IN', accountId: account.id,
        // A capital contribution is money in, not profit.
        excludeFromProfit: Boolean(data.excludeFromProfit),
      });
      break;
    case 'ADJUSTMENT': {
      if (!['IN', 'OUT'].includes(data.direction)) throw invalid('Indica si el ajuste suma o resta', 'direction', 'DIRECTION_REQUIRED');
      if (!description) throw invalid('Explica el motivo del ajuste', 'description', 'REASON_REQUIRED');
      entries.push({ ...base, id: randomUUID(), type: ENTRY_TYPES.ADJUSTMENT, direction: data.direction, accountId: account.id });
      break;
    }
    case 'TRANSFER': {
      const to = await assertAccount(data.toAccountId, 'toAccountId');
      if (to.id === account.id) throw invalid('Elige dos cuentas distintas', 'toAccountId', 'SAME_ACCOUNT');
      const transferGroupId = randomUUID();
      entries.push(
        { ...base, id: randomUUID(), type: ENTRY_TYPES.TRANSFER, direction: 'OUT', accountId: account.id, transferGroupId },
        { ...base, id: randomUUID(), type: ENTRY_TYPES.TRANSFER, direction: 'IN', accountId: to.id, transferGroupId },
      );
      break;
    }
    default:
      throw invalid('Tipo de movimiento inválido', 'kind', 'KIND_INVALID');
  }

  const withTax = [];
  for (const e of entries) {
    withTax.push(e);
    const gmf = gmfEntryFor(e, { account: config.accountsById.get(e.accountId), rate: config.gmfRate });
    if (gmf) withTax.push({ ...gmf, createdById: adminId });
  }

  const created = await repo.insertEntries(withTax);
  await auditService.logAction({
    adminId,
    action: FINANCE_ACTIONS.ENTRY_CREATE,
    targetType: 'LedgerEntry',
    targetId: created[0].id,
    payload: { kind, amount, accountId: account.id, toAccountId: data.toAccountId ?? null, effectiveAt, ids: created.map((e) => e.id) },
    request,
  });
  return created.map(serializeEntry);
}

/**
 * Cancel an entry with its opposite. Its GMF and, for a transfer, the other
 * leg are reversed with it. A projected entry stays reversed: its source key
 * is taken, so the projection never re-creates it.
 */
export async function reverseEntry({ adminId, id, reason, request, now = new Date() }) {
  const config = await loadConfig();
  if (!config.configured) throw new FinanceError('Configura la fecha de corte y las cuentas', 'NOT_CONFIGURED');
  const text = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
  if (!text) throw invalid('Explica por qué se anula', 'reason', 'REASON_REQUIRED');

  const entry = await repo.findEntry(id);
  if (!entry) throw new FinanceError('Movimiento no encontrado', 'NOT_FOUND');
  if (entry.type === ENTRY_TYPES.REVERSAL) throw new FinanceError('Un reverso no se puede reversar', 'INVALID_STATE');
  if (entry.reversedBy) throw new FinanceError('Este movimiento ya fue reversado', 'INVALID_STATE');

  const linked = await repo.findLinkedEntries(entry);
  const effectiveAt = now < config.cutoff ? config.cutoff : now;
  const reversals = [entry, ...linked].map((e) => ({
    ...reversalOf(e, { effectiveAt, description: text, createdById: adminId }),
    id: randomUUID(),
  }));

  let created;
  try {
    created = await repo.insertEntries(reversals);
  } catch (err) {
    if (err?.code === 'P2002') throw new FinanceError('Este movimiento ya fue reversado', 'INVALID_STATE');
    throw err;
  }
  await auditService.logAction({
    adminId,
    action: FINANCE_ACTIONS.ENTRY_REVERSE,
    targetType: 'LedgerEntry',
    targetId: id,
    payload: { reason: text, reversed: [entry, ...linked].map((e) => e.id) },
    request,
  });
  return created.map(serializeEntry);
}

// ─── Reads ───────────────────────────────────────────────────────────────

export function serializeEntry(e) {
  return {
    id: e.id,
    type: e.type,
    direction: e.direction,
    amount: Number(e.amount),
    signedAmount: (e.direction === 'IN' ? 1 : -1) * Number(e.amount),
    account: e.account ?? { id: e.accountId },
    effectiveAt: e.effectiveAt,
    createdAt: e.createdAt,
    automatic: Boolean(e.sourceKey),
    sourceType: e.sourceType ?? null,
    sourceId: e.sourceId ?? null,
    isEstimate: Boolean(e.isEstimate),
    excludeFromProfit: Boolean(e.excludeFromProfit),
    category: e.category ?? null,
    description: e.description ?? null,
    hasProof: Boolean(e.proofS3Key),
    transferGroupId: e.transferGroupId ?? null,
    reversesId: e.reversesId ?? null,
    reversesType: e.reverses?.type ?? null,
    reversed: Boolean(e.reversedBy),
    tutorId: e.tutorId ?? null,
  };
}

export async function listEntries(filters) {
  await syncedConfig();
  const { items, total } = await repo.listEntries(filters);
  return { items: items.map(serializeEntry), total };
}

const CSV_COLUMNS = [
  ['effectiveAt', 'Fecha'], ['type', 'Tipo'], ['direction', 'Dirección'], ['amount', 'Monto'],
  ['account', 'Cuenta'], ['category', 'Categoría'], ['description', 'Descripción'],
  ['isEstimate', 'Estimado'], ['excludeFromProfit', 'Fuera de ganancia'], ['source', 'Origen'], ['id', 'Id'],
];

function csvCell(v) {
  const s = v == null ? '' : String(v);
  // Neutralise spreadsheet formulas (CSV injection) and quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function exportEntriesCsv(filters) {
  await syncedConfig();
  const rows = await repo.allEntries(filters);
  const lines = [CSV_COLUMNS.map(([, h]) => csvCell(h)).join(',')];
  for (const e of rows) {
    const s = serializeEntry(e);
    const values = {
      effectiveAt: new Date(s.effectiveAt).toISOString(),
      type: s.type,
      direction: s.direction,
      amount: s.amount.toFixed(2),
      account: s.account?.name ?? s.account?.id,
      category: s.category?.name ?? '',
      description: s.description ?? '',
      isEstimate: s.isEstimate ? 'sí' : 'no',
      excludeFromProfit: s.excludeFromProfit ? 'sí' : 'no',
      source: s.sourceType ? `${s.sourceType}:${s.sourceId}` : 'manual',
      id: s.id,
    };
    lines.push(CSV_COLUMNS.map(([k]) => csvCell(values[k])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Cash, what is owed, what is available and the profit of [from, to).
 * Defaults: the period is the current month (UTC) and the profit since the
 * cutoff is reported next to it.
 */
export async function getSummary({ from, to, now = new Date() } = {}) {
  const config = await syncedConfig();

  const periodFrom = from ? new Date(from) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodTo = to ? new Date(to) : now;
  const clampFrom = (d) => (d < config.cutoff ? config.cutoff : d);

  // "Por pagar" is exactly what the Pagos a tutores page says is left to transfer.
  const [sums, shares, pendingRefunds, sessionPayouts, eventPayouts] = await Promise.all([
    repo.sumsByAccount(),
    repo.pendingTutorShares(now),
    repo.pendingEventRefunds(),
    listPendingPayoutsByTutor(),
    listEventPayouts(),
  ]);

  const balances = new Map();
  for (const row of sums) {
    const v = Number(row._sum.amount ?? 0) * (row.direction === 'IN' ? 1 : -1);
    balances.set(row.accountId, money((balances.get(row.accountId) ?? 0) + v));
  }
  const accounts = config.accountList.map((a) => ({
    id: a.id, name: a.name, type: a.type, isActive: a.isActive, balance: balances.get(a.id) ?? 0,
  }));
  const cash = money(accounts.reduce((acc, a) => acc + a.balance, 0));

  const sessionsOwed = money(sessionPayouts.totals.tutorOwed ?? 0);
  const sessionsUpcoming = money(shares.filter((s) => !s.happened).reduce((acc, s) => acc + tutorPayout(s.tutorPayoutBase), 0));

  const [period, sinceCutoff] = await Promise.all([
    profitOf({ from: clampFrom(periodFrom), to: periodTo, now }),
    profitOf({ from: config.cutoff, to: now, now }),
  ]);
  const eventsOwed = money(eventPayouts.totalOwed);

  const owedToTutors = money(sessionsOwed + eventsOwed);
  const committed = money(owedToTutors + sessionsUpcoming + pendingRefunds);

  return {
    cutoffDate: config.cutoff,
    accounts,
    cash,
    owed: {
      sessions: sessionsOwed,
      events: eventsOwed,
      total: owedToTutors,
      upcomingSessions: sessionsUpcoming,
      pendingRefunds: money(pendingRefunds),
    },
    available: money(cash - committed),
    profit: { period: stripInternal(period), sinceCutoff: stripInternal(sinceCutoff) },
  };
}

const stripInternal = ({ eventsTutorsOwed, ...rest }) => rest;

/**
 * Profit of [from, to): sessions and repasos that happened in the period
 * under the fee rules, plus what only the ledger knows (4x1000, expenses,
 * other income, adjustments).
 */
async function profitOf({ from, to, now }) {
  const [sessionRows, events, ledgerRows] = await Promise.all([
    repo.heldSessionPayments({ from, to }),
    eventFinance({ from, to, now }),
    repo.profitEntries({ from, to }),
  ]);

  const sessions = aggregateFinancials(sessionRows);
  const sessionRefunds = money(sessionRows.reduce((acc, r) => acc + r.refunded, 0));
  const ledger = ledgerProfitItems(ledgerRows);

  const expensesByCategory = new Map();
  for (const e of ledgerRows) {
    const type = e.type === 'REVERSAL' ? e.reverses?.type : e.type;
    if (type !== 'EXPENSE' || e.excludeFromProfit) continue;
    const name = e.category?.name ?? 'Sin categoría';
    const v = (e.direction === 'OUT' ? 1 : -1) * Number(e.amount);
    expensesByCategory.set(name, money((expensesByCategory.get(name) ?? 0) + v));
  }

  const sessionsNet = money(sessions.calicoNet - sessionRefunds);
  const eventsNet = money(events.earnings.calicoNet);
  return {
    from,
    to,
    sessions: {
      count: sessions.paymentsCount,
      gross: money(sessions.gross),
      tutorPayout: money(sessions.tutorPayout),
      wompiFees: money(sessions.wompiFeeTotal),
      refunds: sessionRefunds,
      net: sessionsNet,
    },
    events: {
      count: events.earnings.events,
      collected: money(events.earnings.collected),
      tutorPayout: money(events.earnings.tutorPayout),
      wompiFees: money(events.earnings.wompiFees),
      net: eventsNet,
    },
    gmf: money(-ledger.gmf),
    expenses: money(-ledger.expenses),
    expensesByCategory: [...expensesByCategory.entries()].map(([name, amount]) => ({ name, amount })),
    otherIncome: ledger.otherIncome,
    adjustments: ledger.adjustments,
    total: money(sessionsNet + eventsNet + ledger.total),
    eventsTutorsOwed: events.tutorsOwed,
  };
}

// ─── Session refunds ─────────────────────────────────────────────────────

/**
 * Refund (all or part of) what a student paid for a tutoring session. The
 * Wompi fee is not recovered. The money leaves `accountId` with its proof;
 * the ledger projects the REFUND (and its 4x1000) from the payment row.
 */
export async function refundSessionPayment({ adminId, paymentId, amount, accountId, refundedAt, reason, proofS3Key, request }) {
  const payment = await repo.findPaymentForRefund(paymentId);
  if (!payment) throw new FinanceError('Pago no encontrado', 'NOT_FOUND');
  if (payment.status !== 'paid') throw new FinanceError('Solo se devuelve un pago cobrado', 'INVALID_STATE');
  if (payment.refundStatus === 'Refunded') throw new FinanceError('Este pago ya fue devuelto', 'INVALID_STATE');

  const charged = Number(payment.amount);
  const value = amount == null ? charged : parseAmount(amount);
  if (value > charged) throw invalid('No se puede devolver más de lo cobrado', 'amount', 'AMOUNT_OVER_CHARGE');
  const text = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
  if (!text) throw invalid('Indica el motivo de la devolución', 'reason', 'REASON_REQUIRED');

  const transfer = await resolveTransfer({ accountId, paidAt: refundedAt, proofS3Key });
  const changed = await repo.markSessionPaymentRefunded(paymentId, {
    refundAmount: value,
    refundReason: text,
    refundedAt: transfer.paidAt,
    refundedById: adminId,
    refundAccountId: transfer.accountId,
    refundProofS3Key: transfer.proofS3Key,
  });
  if (!changed) throw new FinanceError('Este pago ya fue devuelto', 'INVALID_STATE');

  await auditService.logAction({
    adminId,
    action: FINANCE_ACTIONS.SESSION_REFUND,
    targetType: 'Payment',
    targetId: paymentId,
    payload: {
      amount: value, charged, reason: text, accountId: transfer.accountId,
      tutorAlreadyPaid: payment.tutorPayoutStatus === 'paid',
    },
    request,
  });
  return { paymentId, refundAmount: value, tutorAlreadyPaid: payment.tutorPayoutStatus === 'paid' };
}


function serializeRefundRow(p) {
  return {
    paymentId: p.id,
    amount: Number(p.amount),
    viaWompi: p.wompiId != null,
    chargedAt: p.createdAt,
    refundStatus: p.refundStatus,
    refundAmount: p.refundAmount == null ? null : Number(p.refundAmount),
    refundReason: p.refundReason ?? null,
    refundedAt: p.refundedAt ?? null,
    tutorAlreadyPaid: p.tutorPayoutStatus === 'paid',
    student: p.student,
    tutor: p.tutor,
    session: p.session,
  };
}

/** Paid sessions that were canceled / rejected and not refunded, and the refunds made. */
export async function listSessionRefunds() {
  const { pending, refunded } = await repo.sessionRefundQueue();
  return { pending: pending.map(serializeRefundRow), refunded: refunded.map(serializeRefundRow) };
}
