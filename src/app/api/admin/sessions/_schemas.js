/**
 * Query schema shared by GET /api/admin/sessions and its CSV export, so the
 * table and the file always apply the same filters.
 *
 *   status       repeatable, SessionStatusEnum values (none = all)
 *   from / to    Bogotá days YYYY-MM-DD, both inclusive, from ≤ to
 *   search       student / tutor name or email, course code or name
 *   upcoming     true = start ≥ now, soonest first
 *   missingMeet  true = Accepted sessions without a Meet link
 *   includeTest  true = include test-course sessions (default: excluded)
 */

import { z } from 'zod';
import { SessionStatusEnum } from '@/generated/prisma';

const flag = z.enum(['true', 'false']).default('false').transform((v) => v === 'true');
const day = z.iso.date().nullable().default(null);

const filterShape = {
  statuses:    z.array(z.enum(Object.values(SessionStatusEnum))).max(Object.keys(SessionStatusEnum).length).default([]),
  from:        day,
  to:          day,
  search:      z.string().trim().max(100).default(''),
  upcoming:    flag,
  missingMeet: flag,
  includeTest: flag,
};

const orderedRange = [
  (f) => !f.from || !f.to || f.from <= f.to,
  { message: 'from must be on or before to', path: ['to'] },
];

export const sessionFiltersSchema = z.object(filterShape).refine(...orderedRange);

export const sessionListSchema = z
  .object({
    ...filterShape,
    limit:  z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine(...orderedRange);

/** Raw query values for the schemas; absent params become undefined (→ defaults). */
export function readSessionQuery(searchParams, extraKeys = []) {
  const raw = { statuses: searchParams.getAll('status') };
  for (const key of ['from', 'to', 'search', 'upcoming', 'missingMeet', 'includeTest', ...extraKeys]) {
    raw[key] = searchParams.get(key) ?? undefined;
  }
  return raw;
}
