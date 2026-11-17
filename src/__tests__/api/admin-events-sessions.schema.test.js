/**
 * @jest-environment node
 *
 * zod shapes of the admin event routes for a repaso split over several days
 * (`sessions`) and for the Meet + WhatsApp links sent together.
 */

import { createEventSchema, updateEventSchema } from '@/app/api/admin/events/_schemas';

const T1 = '11111111-1111-4111-8111-111111111111';
const S1 = { startsAt: '2026-10-18T23:00:00.000Z', endsAt: '2026-10-19T01:00:00.000Z' };
const S2 = { startsAt: '2026-10-20T20:00:00.000Z', endsAt: '2026-10-20T22:00:00.000Z' };

const body = (overrides = {}) => ({
  title: 'Repaso Cálculo',
  description: 'Repaso del parcial',
  tutorIds: [T1],
  startsAt: S1.startsAt,
  endsAt: S2.endsAt,
  modality: 'Virtual',
  autoMeet: false,
  meetingUrl: 'https://zoom.us/j/1',
  price: 0,
  ...overrides,
});

describe('createEventSchema — sessions', () => {
  it('defaults to a single session (null)', () => {
    const parsed = createEventSchema.parse(body());
    expect(parsed.sessions).toBeNull();
  });

  it('accepts 2 sessions and fills a missing duration with null', () => {
    const parsed = createEventSchema.parse(body({ sessions: [S1, S2] }));
    expect(parsed.sessions).toEqual([{ ...S1, durationHours: null }, { ...S2, durationHours: null }]);
  });

  it('coerces a TBC duration and caps it at 12 hours', () => {
    expect(createEventSchema.parse(body({ timeTbc: true, sessions: [{ ...S1, durationHours: '2' }, { ...S2, durationHours: 3 }] })).sessions[0].durationHours).toBe(2);
    expect(createEventSchema.safeParse(body({ sessions: [{ ...S1, durationHours: 13 }, S2] })).success).toBe(false);
  });

  it.each([
    ['one session', [S1]],
    ['eleven sessions', Array.from({ length: 11 }, () => S1)],
    ['a session without an end', [S1, { startsAt: S2.startsAt }]],
    ['a date without offset', [S1, { startsAt: '2026-10-20 15:00', endsAt: S2.endsAt }]],
  ])('rejects %s', (_label, sessions) => {
    expect(createEventSchema.safeParse(body({ sessions })).success).toBe(false);
  });

  it('accepts the meeting link and the WhatsApp group together', () => {
    const parsed = createEventSchema.parse(body({ whatsappUrl: 'https://chat.whatsapp.com/abc' }));
    expect(parsed).toMatchObject({ meetingUrl: 'https://zoom.us/j/1', whatsappUrl: 'https://chat.whatsapp.com/abc' });
  });
});

describe('updateEventSchema — sessions', () => {
  it('can set, keep (absent) or clear (null) the sessions', () => {
    expect(updateEventSchema.parse({ sessions: [S1, S2] }).sessions).toHaveLength(2);
    expect(updateEventSchema.parse({ title: 'Otro' })).not.toHaveProperty('sessions');
    expect(updateEventSchema.parse({ sessions: null }).sessions).toBeNull();
  });
});
