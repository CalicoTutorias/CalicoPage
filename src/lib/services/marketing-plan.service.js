/**
 * Marketing Plan Service
 *
 * Plan de contenido of the content-creator tool: a guide of what to post on
 * each day of a season, shown on the tool's home page. Each entry carries the
 * brief that pre-fills the tool's form; the piece born from an entry uses the
 * entry `key` as its slug, so the tool links them without extra columns.
 * Used only by /api/content-creator/* (personal token).
 *
 * - A whole season is imported once (savePlan with baseVersion 0 + entries).
 * - After that, entries are created, edited, moved, skipped or deleted one by
 *   one, each with its own optimistic lock on `version` (409 if someone else
 *   saved first). The plan header (title, dates, settings) has its own lock.
 */

import { z } from 'zod';
import * as repo from '../repositories/marketing-plan.repository';
import { SLUG_RE } from './marketing-post.service';
import { calendarDate, isCalendarDate } from '../utils/calendar-date';

// The plan key can't be "current": that path segment returns the running plan.
export const PLAN_KEY_RE = /^(?!current$)[a-z0-9][a-z0-9-]{0,40}$/;

export const ENTRY_FORMATS = [
  'reel-fundadores', 'reel-digital', 'carrusel', 'post-unico', 'historias', 'historia-sola', 'grabacion', 'perfil',
];

// Piece types the tool's form knows (marketing-piece.service TYPES) plus 'reel-animado',
// the 100% digital reel the tool will create once that type exists.
const BRIEF_TYPES = ['publicacion', 'historia', 'reel', 'reel-editado', 'presentacion', 'reel-animado'];

const MAX_DETAILS_CHARS = 20_000;
const MAX_SETTINGS_CHARS = 50_000;
const MAX_ENTRIES = 500;

// ── Validation ───────────────────────────────────

function domainError(message, code, extra = {}) {
  const err = new Error(message);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function parse(schema, input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw domainError(`${issue.path.join('.') || 'body'}: ${issue.message}`, 'VALIDATION_ERROR');
  }
  return parsed.data;
}

function assertPlanKey(key) {
  if (typeof key !== 'string' || !PLAN_KEY_RE.test(key)) throw domainError('Identificador de plan inválido', 'VALIDATION_ERROR');
}

function assertEntryKey(key) {
  if (typeof key !== 'string' || !SLUG_RE.test(key)) throw domainError('Identificador de entrada inválido', 'VALIDATION_ERROR');
}

const fitsIn = (max) => [(v) => JSON.stringify(v).length <= max, { message: 'demasiado grande' }];
const jsonObject = (max) => z.record(z.string(), z.unknown()).refine(...fitsIn(max));

// Known brief fields are checked; unknown ones pass through so the tool can grow the
// brief without an API change.
const briefSchema = z.object({
  tipo: z.enum(BRIEF_TYPES),
  audiencia: z.enum(['estudiantes', 'tutores', 'ambos']),
  objetivo: z.enum(['educar', 'promocionar', 'anunciar', 'captar-tutores', 'comunidad']).nullable().optional(),
  cantidad: z.number().int().min(1).max(40).optional(),
  unica: z.boolean().optional(),
  tema: z.string().max(2000).optional(),
  descripcion: z.string().max(5000).optional(),
}).passthrough().refine(...fitsIn(MAX_DETAILS_CHARS));

const entryFields = {
  date: calendarDate.schema,
  format: z.enum(ENTRY_FORMATS),
  title: z.string().trim().min(1).max(200),
  brief: briefSchema.nullable().default(null),
  details: jsonObject(MAX_DETAILS_CHARS).default({}),
  skipped: z.boolean().default(false),
};

const entrySaveSchema = z.object({ baseVersion: z.number().int().min(0), ...entryFields });

const importEntrySchema = z.object({ key: z.string().regex(SLUG_RE), ...entryFields });

const planSaveSchema = z.object({
  baseVersion: z.number().int().min(0), // 0 = crear (con sus entradas)
  title: z.string().trim().min(1).max(200),
  startsOn: calendarDate.schema,
  endsOn: calendarDate.schema,
  settings: jsonObject(MAX_SETTINGS_CHARS).default({}),
  entries: z.array(importEntrySchema).max(MAX_ENTRIES).optional(),
})
  .refine((p) => p.startsOn <= p.endsOn, { message: 'debe ser igual o posterior a startsOn', path: ['endsOn'] })
  .refine((p) => !p.entries || new Set(p.entries.map((e) => e.key)).size === p.entries.length, {
    message: 'keys repetidas', path: ['entries'],
  });

// ── Output ───────────────────────────────────────

const personName = (u) => (u ? u.name || u.email : null);

const toEntry = (e) => ({
  key: e.key,
  date: calendarDate.fromDb(e.date),
  format: e.format,
  title: e.title,
  brief: e.brief ?? null,
  details: e.details || {},
  skipped: e.skipped,
  version: e.version,
  updatedAt: e.updatedAt,
  updatedBy: personName(e.updatedBy),
});

const toPlan = (p) => ({
  key: p.key,
  title: p.title,
  startsOn: calendarDate.fromDb(p.startsOn),
  endsOn: calendarDate.fromDb(p.endsOn),
  settings: p.settings || {},
  version: p.version,
  updatedAt: p.updatedAt,
  updatedBy: personName(p.updatedBy),
  entries: (p.entries || []).map(toEntry),
});

const entryColumns = (e, actor) => ({
  date: calendarDate.toDb(e.date),
  format: e.format,
  title: e.title,
  brief: e.brief,
  details: e.details,
  skipped: e.skipped,
  updatedById: actor.sub,
});

// ── Plans ────────────────────────────────────────

/** The plan running today (or the next one); otherwise the most recent. NOT_FOUND if there is none. */
export async function getCurrentPlan() {
  const plan = await repo.findCurrentPlan(calendarDate.toDb(calendarDate.today()));
  if (!plan) throw domainError('Todavía no hay plan de contenido', 'NOT_FOUND');
  return toPlan(plan);
}

export async function getPlan(key) {
  assertPlanKey(key);
  const plan = await repo.findPlan(key);
  if (!plan) throw domainError('Plan no encontrado', 'NOT_FOUND');
  return toPlan(plan);
}

export async function listPlans() {
  return (await repo.listPlans()).map((p) => ({
    key: p.key,
    title: p.title,
    startsOn: calendarDate.fromDb(p.startsOn),
    endsOn: calendarDate.fromDb(p.endsOn),
    version: p.version,
  }));
}

/**
 * Create a plan with all its entries (baseVersion 0) or update its header
 * (title, dates, settings). Entries are only accepted on create: afterwards
 * they are edited one by one with saveEntry.
 * @returns {Promise<{ key: string, version: number, created: boolean, entries?: number }>}
 */
export async function savePlan(key, input, actor) {
  assertPlanKey(key);
  const data = parse(planSaveSchema, input);
  const fields = {
    title: data.title,
    startsOn: calendarDate.toDb(data.startsOn),
    endsOn: calendarDate.toDb(data.endsOn),
    settings: data.settings,
    updatedById: actor.sub,
  };

  if (data.baseVersion === 0) {
    const existing = await repo.findPlanMeta(key);
    if (existing) throw domainError('El plan ya existe', 'CONFLICT', { currentVersion: existing.version });
    const entries = data.entries || [];
    if (entries.length) {
      const taken = await repo.existingEntryKeys(entries.map((e) => e.key));
      if (taken.length) {
        throw domainError(`Ya hay entradas con estos identificadores: ${taken.sort().join(', ')}`, 'VALIDATION_ERROR');
      }
    }
    const created = await repo.createPlanWithEntries(
      { key, ...fields, createdById: actor.sub },
      entries.map((e) => ({ key: e.key, ...entryColumns(e, actor), createdById: actor.sub })),
    );
    return { key, version: created.version, created: true, entries: entries.length };
  }

  if (data.entries) {
    throw domainError('Las entradas solo se importan al crear el plan; después se editan una por una', 'VALIDATION_ERROR');
  }
  const count = await repo.updatePlanIfVersion(key, data.baseVersion, fields);
  if (count === 0) {
    const current = await repo.findPlanMeta(key);
    if (!current) throw domainError('Plan no encontrado', 'NOT_FOUND');
    throw domainError('Otra persona guardó el plan antes', 'CONFLICT', { currentVersion: current.version });
  }
  return { key, version: data.baseVersion + 1, created: false };
}

// ── Entries ──────────────────────────────────────

/**
 * Create (baseVersion 0) or update an entry of the plan `planKey`.
 * @returns {Promise<{ key: string, version: number, created: boolean }>}
 */
export async function saveEntry(planKey, entryKey, input, actor) {
  assertPlanKey(planKey);
  assertEntryKey(entryKey);
  const data = parse(entrySaveSchema, input);
  const fields = entryColumns(data, actor);

  if (data.baseVersion === 0) {
    const plan = await repo.findPlanMeta(planKey);
    if (!plan) throw domainError('Plan no encontrado', 'NOT_FOUND');
    const existing = await repo.findEntry(entryKey);
    if (existing) throw domainError('Ya hay una entrada con ese identificador', 'CONFLICT', { currentVersion: existing.version });
    const created = await repo.createEntry({ key: entryKey, planId: plan.id, ...fields, createdById: actor.sub });
    return { key: entryKey, version: created.version, created: true };
  }

  const count = await repo.updateEntryIfVersion(planKey, entryKey, data.baseVersion, fields);
  if (count === 0) {
    const current = await repo.findEntry(entryKey);
    if (!current || current.plan.key !== planKey) throw domainError('Entrada no encontrada', 'NOT_FOUND');
    throw domainError('Otra persona cambió esta entrada antes', 'CONFLICT', { currentVersion: current.version });
  }
  return { key: entryKey, version: data.baseVersion + 1, created: false };
}

/** Delete an entry. The piece born from it (if any) stays. */
export async function deleteEntry(planKey, entryKey) {
  assertPlanKey(planKey);
  assertEntryKey(entryKey);
  const entry = await repo.findEntry(entryKey);
  if (!entry || entry.plan.key !== planKey) throw domainError('Entrada no encontrada', 'NOT_FOUND');
  await repo.deleteEntry(entryKey);
  return { key: entryKey, title: entry.title };
}

// Exported for tests
export const __testing = { planSaveSchema, entrySaveSchema, isCalendarDate };
