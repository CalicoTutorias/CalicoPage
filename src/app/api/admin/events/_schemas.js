/**
 * Shared zod field schemas + error mapping for the admin event routes.
 * Shapes only; the cross-field rules (dates, modality, pricing, tutors) are
 * checked by event-admin.service on the merged draft (event-rules.js).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

// null / '' are tried first: z.coerce.number() would turn them into 0.
const nullableInt = z.union([z.null(), z.literal(''), z.coerce.number().int()]).transform((v) => (v === '' ? null : v));
const httpsUrl = z.string().trim().url().max(500).refine((u) => u.startsWith('https://'), 'El enlace debe empezar con https://');

export const eventFieldSchemas = {
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(1).max(5000),
  coverImageKey: z.union([z.string().startsWith('event-images/').max(200), z.null()]),
  courseId: z.union([z.string().uuid(), z.null()]),
  tutorIds: z.array(z.string().uuid()).min(1).max(10),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  modality: z.enum(['Virtual', 'InPerson']),
  autoMeet: z.boolean(),
  meetingUrl: z.union([httpsUrl, z.literal(''), z.null()]).transform((v) => (v === '' ? null : v)),
  location: z.union([z.string().trim().max(300), z.null()]),
  price: z.coerce.number().int().min(0).max(10_000_000),
  earlyBirdSlots: nullableInt,
  earlyBirdPercent: nullableInt,
  isListed: z.boolean(),
};

export const createEventSchema = z.object({
  ...eventFieldSchemas,
  coverImageKey: eventFieldSchemas.coverImageKey.optional(),
  courseId: eventFieldSchemas.courseId.optional().default(null),
  meetingUrl: eventFieldSchemas.meetingUrl.optional().default(null),
  location: eventFieldSchemas.location.optional().default(null),
  earlyBirdSlots: eventFieldSchemas.earlyBirdSlots.optional().default(null),
  earlyBirdPercent: eventFieldSchemas.earlyBirdPercent.optional().default(null),
  isListed: eventFieldSchemas.isListed.optional().default(true),
});

export const updateEventSchema = z
  .object(Object.fromEntries(Object.entries(eventFieldSchemas).map(([k, s]) => [k, s.optional()])))
  .refine((d) => Object.keys(d).length > 0, { message: 'Nada que actualizar' });

export const eventIdSchema = z.string().uuid('Identificador inválido');

export function invalidEventId() {
  return NextResponse.json({ success: false, error: 'Identificador inválido' }, { status: 400 });
}

/** First zod issue as a 400 (same shape as the coupon routes). */
export function invalidBody(parsed) {
  return NextResponse.json(
    { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
    { status: 400 },
  );
}

const STATUS_BY_CODE = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  PRICE_LOCKED: 409,
  INVALID_STATE: 409,
  REMINDER_COOLDOWN: 429,
  CALENDAR_ERROR: 502,
  EMAIL_TEMPLATE_NOT_CONFIGURED: 503,
};

/** Map a service error to an HTTP response; unknown errors become a 500. */
export function eventErrorResponse(err, routeTag) {
  const status = STATUS_BY_CODE[err?.code];
  if (status) {
    return NextResponse.json(
      { success: false, error: err.message, code: err.code, ...(err.rule ? { rule: err.rule } : {}), ...(err.field ? { field: err.field } : {}) },
      { status },
    );
  }
  console.error(`[${routeTag}]:`, err?.message);
  return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
}
