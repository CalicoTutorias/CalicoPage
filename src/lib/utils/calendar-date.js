/**
 * Calendar days ('YYYY-MM-DD') stored in DATE columns at UTC midnight: the plan
 * de contenido and the agenda of the content-creator pieces. A calendar day has
 * no time, so it never moves with the user's timezone.
 */

import { z } from 'zod';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A real day of the calendar written as YYYY-MM-DD (rejects 2026-02-30). */
export const isCalendarDate = (s) => typeof s === 'string' && DATE_RE.test(s)
  && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

export const calendarDate = {
  schema: z.string().refine(isCalendarDate, { message: 'fecha inválida (AAAA-MM-DD)' }),
  toDb: (s) => new Date(`${s}T00:00:00.000Z`),
  fromDb: (d) => (d ? new Date(d).toISOString().slice(0, 10) : null),
  today: () => new Date().toISOString().slice(0, 10),
};
