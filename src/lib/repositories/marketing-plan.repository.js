/**
 * Marketing Plan Repository
 *
 * Plan de contenido of the content-creator tool, in Postgres:
 * - `marketing_plans`: one season (dates, `settings` to draw it, `version`).
 * - `marketing_plan_entries`: one row per entry, each with its own `version`.
 * Calendar days are DATE columns (no time): the service converts them from/to
 * 'YYYY-MM-DD'.
 */

import prisma from '../prisma';
import { Prisma } from '../../generated/prisma';

const userName = { select: { name: true, email: true } };

const entrySelect = {
  key: true,
  date: true,
  format: true,
  title: true,
  brief: true,
  details: true,
  skipped: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  updatedBy: userName,
};

const planSelect = {
  id: true,
  key: true,
  title: true,
  startsOn: true,
  endsOn: true,
  settings: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  updatedBy: userName,
};

const withEntries = {
  ...planSelect,
  entries: { select: entrySelect, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] },
};

// A nullable Json column takes Prisma.DbNull, not a plain null.
const jsonOrDbNull = (value) => (value === null ? Prisma.DbNull : value);
const entryData = (data) => ('brief' in data ? { ...data, brief: jsonOrDbNull(data.brief) } : data);

// ── Plans ────────────────────────────────────────

export function findPlan(key) {
  return prisma.marketingPlan.findUnique({ where: { key }, select: withEntries });
}

/** id + version only (existence and optimistic-lock checks). */
export function findPlanMeta(key) {
  return prisma.marketingPlan.findUnique({ where: { key }, select: { id: true, key: true, version: true } });
}

/** The plan running on `today` or the next one to start; otherwise the most recent one. */
export async function findCurrentPlan(today) {
  const running = await prisma.marketingPlan.findFirst({
    where: { endsOn: { gte: today } },
    orderBy: { startsOn: 'asc' },
    select: withEntries,
  });
  return running || prisma.marketingPlan.findFirst({ orderBy: { endsOn: 'desc' }, select: withEntries });
}

export function listPlans() {
  return prisma.marketingPlan.findMany({
    select: { key: true, title: true, startsOn: true, endsOn: true, version: true },
    orderBy: { startsOn: 'desc' },
  });
}

/** Create a plan and all its entries in one statement (the import of a whole season). */
export function createPlanWithEntries(plan, entries) {
  return prisma.marketingPlan.create({
    data: { ...plan, entries: { create: entries.map(entryData) } },
    select: { key: true, version: true },
  });
}

/**
 * Update only if the row still has `baseVersion` (optimistic lock).
 * @returns {Promise<number>} rows updated (0 = missing or someone saved first)
 */
export async function updatePlanIfVersion(key, baseVersion, data) {
  const { count } = await prisma.marketingPlan.updateMany({
    where: { key, version: baseVersion },
    data: { ...data, version: { increment: 1 } },
  });
  return count;
}

// ── Entries ──────────────────────────────────────

/** Entry keys that already exist (entry keys are unique across every plan). */
export async function existingEntryKeys(keys) {
  const rows = await prisma.marketingPlanEntry.findMany({ where: { key: { in: keys } }, select: { key: true } });
  return rows.map((r) => r.key);
}

export function findEntry(key) {
  return prisma.marketingPlanEntry.findUnique({
    where: { key },
    select: { ...entrySelect, plan: { select: { key: true } } },
  });
}

export function createEntry(data) {
  return prisma.marketingPlanEntry.create({ data: entryData(data), select: { key: true, version: true } });
}

/** Optimistic-lock update of an entry that belongs to `planKey`. @returns {Promise<number>} */
export async function updateEntryIfVersion(planKey, key, baseVersion, data) {
  const { count } = await prisma.marketingPlanEntry.updateMany({
    where: { key, version: baseVersion, plan: { key: planKey } },
    data: { ...entryData(data), version: { increment: 1 } },
  });
  return count;
}

export function deleteEntry(key) {
  return prisma.marketingPlanEntry.delete({ where: { key } });
}
