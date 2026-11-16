/**
 * Finance Repository — ledger (libro de movimientos), its accounts,
 * categories and settings, plus the source rows the ledger is projected from.
 *
 * ledger_entries is append-only (a DB trigger refuses UPDATE / DELETE):
 * nothing here edits or deletes an entry.
 */

import prisma from '../prisma';
import { METRICS_EXCLUDED_COURSE_CODES } from './metrics-exclusions';

const toNumber = (v) => (v == null ? null : Number(v));
const isExcludedCourse = (code) => METRICS_EXCLUDED_COURSE_CODES.includes(code);

// ─── Settings ───────────────────────────────────────────────────────────

const SETTINGS_ID = 1;

export async function getSettings() {
  return prisma.financeSettings.findUnique({ where: { id: SETTINGS_ID } });
}

export async function upsertSettings(data) {
  return prisma.financeSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });
}

// ─── Accounts & categories ──────────────────────────────────────────────

const ACCOUNT_SELECT = { id: true, name: true, type: true, gmfApplies: true, isActive: true, createdAt: true };

export async function listAccounts({ activeOnly = false } = {}) {
  return prisma.financeAccount.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    select: ACCOUNT_SELECT,
  });
}

export async function findAccount(id) {
  return prisma.financeAccount.findUnique({ where: { id }, select: ACCOUNT_SELECT });
}

export async function createAccount(data) {
  return prisma.financeAccount.create({ data, select: ACCOUNT_SELECT });
}

export async function updateAccount(id, data) {
  return prisma.financeAccount.update({ where: { id }, data, select: ACCOUNT_SELECT });
}

const CATEGORY_SELECT = { id: true, name: true, isActive: true };

export async function listCategories({ activeOnly = false } = {}) {
  return prisma.expenseCategory.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { name: 'asc' },
    select: CATEGORY_SELECT,
  });
}

export async function findCategory(id) {
  return prisma.expenseCategory.findUnique({ where: { id }, select: CATEGORY_SELECT });
}

export async function createCategory(data) {
  return prisma.expenseCategory.create({ data, select: CATEGORY_SELECT });
}

export async function updateCategory(id, data) {
  return prisma.expenseCategory.update({ where: { id }, data, select: CATEGORY_SELECT });
}

// ─── Ledger entries ─────────────────────────────────────────────────────

const ENTRY_SELECT = {
  id: true,
  type: true,
  direction: true,
  amount: true,
  accountId: true,
  effectiveAt: true,
  createdAt: true,
  sourceKey: true,
  sourceType: true,
  sourceId: true,
  isEstimate: true,
  excludeFromProfit: true,
  categoryId: true,
  description: true,
  proofS3Key: true,
  transferGroupId: true,
  reversesId: true,
  tutorId: true,
  createdById: true,
  account: { select: { id: true, name: true, type: true } },
  category: { select: { id: true, name: true } },
  reverses: { select: { id: true, type: true } },
  reversedBy: { select: { id: true } },
};

/** How many entries exist (the cutoff can only move while there are none). */
export async function countEntries() {
  return prisma.ledgerEntry.count();
}

/**
 * Insert projected entries; rows whose `sourceKey` already exists are skipped,
 * so projecting the same sources again (or two requests at once) never
 * duplicates. @returns {Promise<number>} how many were inserted
 */
export async function insertProjectedEntries(entries) {
  if (entries.length === 0) return 0;
  const { count } = await prisma.ledgerEntry.createMany({ data: entries, skipDuplicates: true });
  return count;
}

/** Existing source keys among `keys` (to project only what is missing). */
export async function existingSourceKeys(keys) {
  if (keys.length === 0) return new Set();
  const rows = await prisma.ledgerEntry.findMany({
    where: { sourceKey: { in: keys } },
    select: { sourceKey: true },
  });
  return new Set(rows.map((r) => r.sourceKey));
}

/** Insert manual entries together (a transfer pair, an expense and its GMF). */
export async function insertEntries(entries) {
  return prisma.$transaction(entries.map((data) => prisma.ledgerEntry.create({ data, select: ENTRY_SELECT })));
}

export async function findEntry(id) {
  return prisma.ledgerEntry.findUnique({ where: { id }, select: ENTRY_SELECT });
}

/** Entries that must be reversed together with `entry`: its GMF and its transfer pair. */
export async function findLinkedEntries(entry) {
  const or = [{ sourceKey: `GMF:ENTRY:${entry.id}` }];
  if (entry.sourceKey) or.push({ sourceKey: `GMF:${entry.sourceKey}` });
  if (entry.transferGroupId) or.push({ transferGroupId: entry.transferGroupId, type: 'TRANSFER' });
  return prisma.ledgerEntry.findMany({
    where: { id: { not: entry.id }, reversedBy: null, type: { not: 'REVERSAL' }, OR: or },
    select: ENTRY_SELECT,
  });
}

function entryWhere({ from, to, accountId, type, categoryId } = {}) {
  const where = {};
  if (from || to) where.effectiveAt = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };
  if (accountId) where.accountId = accountId;
  if (type) where.type = type;
  if (categoryId) where.categoryId = categoryId;
  return where;
}

export async function listEntries({ limit = 50, offset = 0, ...filters } = {}) {
  const where = entryWhere(filters);
  const [items, total] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where,
      orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      skip: offset,
      select: ENTRY_SELECT,
    }),
    prisma.ledgerEntry.count({ where }),
  ]);
  return { items, total };
}

/** Every entry of the filter (CSV export), oldest first. */
export async function allEntries(filters = {}) {
  return prisma.ledgerEntry.findMany({
    where: entryWhere(filters),
    orderBy: [{ effectiveAt: 'asc' }, { createdAt: 'asc' }],
    select: ENTRY_SELECT,
  });
}

/** Σ IN and Σ OUT per account up to `until` (exclusive). */
export async function sumsByAccount({ until } = {}) {
  return prisma.ledgerEntry.groupBy({
    by: ['accountId', 'direction'],
    where: until ? { effectiveAt: { lt: until } } : undefined,
    _sum: { amount: true },
  });
}

/** Entries that can count in a period's profit (with what a reversal reverses). */
export async function profitEntries({ from, to }) {
  return prisma.ledgerEntry.findMany({
    where: {
      effectiveAt: { gte: from, lt: to },
      OR: [
        { type: { in: ['GMF', 'EXPENSE', 'OTHER_INCOME', 'ADJUSTMENT'] } },
        { type: 'REVERSAL', reverses: { type: { in: ['GMF', 'EXPENSE', 'OTHER_INCOME', 'ADJUSTMENT'] } } },
      ],
    },
    select: {
      type: true, direction: true, amount: true, excludeFromProfit: true, categoryId: true,
      category: { select: { name: true } },
      reverses: { select: { type: true, categoryId: true } },
    },
  });
}

// ─── Sources the ledger is projected from ───────────────────────────────

/**
 * Session payments with something that happened on/after the cutoff: the
 * charge, the transfer to the tutor or a refund.
 */
export async function sessionPaymentSources(cutoff) {
  const rows = await prisma.payment.findMany({
    where: {
      status: 'paid',
      OR: [
        { createdAt: { gte: cutoff } },
        { proofUploadedAt: { gte: cutoff } },
        { tutorPayoutAt: { gte: cutoff } },
        { refundedAt: { gte: cutoff } },
      ],
    },
    select: {
      id: true,
      amount: true,
      tutorPayoutBase: true,
      wompiId: true,
      createdAt: true,
      proofUploadedAt: true,
      tutorId: true,
      tutorPayoutStatus: true,
      tutorPayoutAt: true,
      tutorPayoutAccountId: true,
      tutorPayoutProofS3Key: true,
      refundStatus: true,
      refundAmount: true,
      refundedAt: true,
      refundAccountId: true,
      refundProofS3Key: true,
      session: { select: { course: { select: { code: true } } } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    tutorPayoutBase: toNumber(p.tutorPayoutBase),
    viaWompi: p.wompiId != null,
    // A Wompi charge is paid when it is created; a manual one when its proof arrives.
    chargedAt: p.wompiId != null ? p.createdAt : (p.proofUploadedAt ?? p.createdAt),
    excluded: isExcludedCourse(p.session?.course?.code),
    tutorId: p.tutorId,
    tutorPayoutStatus: p.tutorPayoutStatus,
    tutorPayoutAt: p.tutorPayoutAt,
    tutorPayoutAccountId: p.tutorPayoutAccountId,
    tutorPayoutProofS3Key: p.tutorPayoutProofS3Key,
    refundStatus: p.refundStatus,
    refundAmount: toNumber(p.refundAmount),
    refundedAt: p.refundedAt,
    refundAccountId: p.refundAccountId,
    refundProofS3Key: p.refundProofS3Key,
  }));
}

const eventExcluded = (event) => isExcludedCourse(event?.course?.code);

/** Wompi charges of repasos created or refunded on/after the cutoff. */
export async function eventPaymentSources(cutoff) {
  const rows = await prisma.eventPayment.findMany({
    where: { OR: [{ createdAt: { gte: cutoff } }, { refundedAt: { gte: cutoff } }] },
    select: {
      id: true,
      amount: true,
      createdAt: true,
      refundStatus: true,
      refundAmount: true,
      refundedAt: true,
      refundAccountId: true,
      refundProofS3Key: true,
      registration: { select: { event: { select: { course: { select: { code: true } } } } } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    createdAt: p.createdAt,
    refundStatus: p.refundStatus,
    refundAmount: toNumber(p.refundAmount),
    refundedAt: p.refundedAt,
    refundAccountId: p.refundAccountId,
    refundProofS3Key: p.refundProofS3Key,
    excluded: eventExcluded(p.registration?.event),
  }));
}

/** Confirmed registrations of manual (approval) repasos, settled outside Wompi. */
export async function manualEventChargeSources(cutoff) {
  const rows = await prisma.eventRegistration.findMany({
    where: {
      status: 'Confirmed',
      confirmedAt: { gte: cutoff },
      finalAmount: { gt: 0 },
      event: { requiresApproval: true },
    },
    select: {
      id: true,
      finalAmount: true,
      confirmedAt: true,
      event: { select: { course: { select: { code: true } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    amount: Number(r.finalAmount),
    confirmedAt: r.confirmedAt,
    excluded: eventExcluded(r.event),
  }));
}

/** Transfers to repaso tutors on/after the cutoff. */
export async function eventTutorPayoutSources(cutoff) {
  const rows = await prisma.eventTutorPayout.findMany({
    where: { paidAt: { gte: cutoff } },
    select: {
      id: true, amount: true, paidAt: true, accountId: true, tutorId: true, proofS3Key: true,
      event: { select: { course: { select: { code: true } } } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    paidAt: p.paidAt,
    accountId: p.accountId,
    tutorId: p.tutorId,
    proofS3Key: p.proofS3Key,
    excluded: eventExcluded(p.event),
  }));
}

// ─── Inputs of the summary ──────────────────────────────────────────────

/**
 * Session payments whose session happened in [from, to): what Calico earned
 * on tutoring in the period (revenue is recognised when the session happens).
 * Canceled / rejected sessions never count; test courses neither.
 */
export async function heldSessionPayments({ from, to }) {
  const rows = await prisma.payment.findMany({
    where: {
      status: 'paid',
      session: {
        course: { code: { notIn: METRICS_EXCLUDED_COURSE_CODES } },
        endTimestamp: { gte: from, lt: to },
        OR: [{ status: 'Completed' }, { status: 'Accepted', endTimestamp: { lt: new Date() } }],
      },
    },
    select: {
      amount: true, originalAmount: true, discountAmount: true, tutorPayoutBase: true, wompiId: true,
      refundStatus: true, refundAmount: true,
    },
  });
  return rows.map((p) => ({
    amount: Number(p.amount),
    originalAmount: toNumber(p.originalAmount),
    discountAmount: toNumber(p.discountAmount),
    tutorPayoutBase: toNumber(p.tutorPayoutBase),
    viaWompi: p.wompiId != null,
    refunded: p.refundStatus === 'Refunded' ? Number(p.refundAmount ?? p.amount) : 0,
  }));
}

/**
 * Tutor shares of paid session payments not transferred yet, split into
 * owed (the session happened) and upcoming (still to come). Refunded and
 * canceled ones are out.
 */
export async function pendingTutorShares(now = new Date()) {
  const rows = await prisma.payment.findMany({
    where: {
      status: 'paid',
      tutorPayoutStatus: 'pending',
      refundStatus: { not: 'Refunded' },
      session: {
        course: { code: { notIn: METRICS_EXCLUDED_COURSE_CODES } },
        status: { in: ['Pending', 'Accepted', 'Completed'] },
      },
    },
    select: {
      amount: true, tutorPayoutBase: true,
      session: { select: { status: true, endTimestamp: true } },
    },
  });
  return rows.map((p) => ({
    tutorPayoutBase: Number(p.tutorPayoutBase ?? p.amount),
    happened: p.session.status === 'Completed'
      || (p.session.status === 'Accepted' && new Date(p.session.endTimestamp) < now),
  }));
}

/** Σ of repaso charges whose refund is still pending. */
export async function pendingEventRefunds() {
  const agg = await prisma.eventPayment.aggregate({
    where: { refundStatus: 'Pending' },
    _sum: { amount: true },
  });
  return Number(agg._sum.amount ?? 0);
}

// ─── Session refunds ────────────────────────────────────────────────────

export async function findPaymentForRefund(id) {
  return prisma.payment.findUnique({
    where: { id },
    select: { id: true, status: true, amount: true, refundStatus: true, tutorPayoutStatus: true },
  });
}

/** None → Refunded, atomically. @returns {Promise<boolean>} whether this call moved it */
export async function markSessionPaymentRefunded(id, data) {
  const { count } = await prisma.payment.updateMany({
    where: { id, status: 'paid', refundStatus: { not: 'Refunded' } },
    data: { ...data, refundStatus: 'Refunded' },
  });
  return count === 1;
}

/**
 * Session payments a refund may be owed for: charged, not refunded yet, and
 * the session was canceled or rejected — plus the refunds already made
 * (newest first), so the admin sees both queues on one screen.
 */
export async function sessionRefundQueue({ limit = 50 } = {}) {
  const select = {
    id: true,
    amount: true,
    wompiId: true,
    createdAt: true,
    refundStatus: true,
    refundAmount: true,
    refundReason: true,
    refundedAt: true,
    tutorPayoutStatus: true,
    student: { select: { id: true, name: true, email: true } },
    tutor: { select: { id: true, name: true } },
    session: {
      select: {
        id: true, status: true, startTimestamp: true,
        course: { select: { code: true, name: true } },
      },
    },
  };
  const [pending, refunded] = await Promise.all([
    prisma.payment.findMany({
      where: {
        status: 'paid',
        amount: { gt: 0 },
        refundStatus: { not: 'Refunded' },
        session: { status: { in: ['Canceled', 'Rejected'] } },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select,
    }),
    prisma.payment.findMany({
      where: { refundStatus: 'Refunded' },
      orderBy: { refundedAt: 'desc' },
      take: limit,
      select,
    }),
  ]);
  return { pending, refunded };
}
