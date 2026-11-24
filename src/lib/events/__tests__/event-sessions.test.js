/**
 * Repaso dividido en varios días: normalización, reglas por sesión, horas,
 * formato para las vistas y su paso por los correos (.ics incluido).
 */

import {
  normalizeSessions, validateSessions, sessionsEnvelope, sessionsTotalHours, eventSessionsOf,
} from '../event-sessions';
import { validateEventDraft, assertPublishable } from '../event-rules';
import { formatEventTime, formatSessionTime, multiDaySessions } from '../../utils/event-format';
import { buildEventIcs } from '../../utils/ics';
import { buildEventEmailParams } from '../../services/event-email.service';

jest.mock('../../services/email.service', () => ({
  EVENT_EMAIL: {},
  isEventEmailConfigured: jest.fn(() => true),
  sendEventEmail: jest.fn(),
}));

// Bogotá = UTC−5. Day 1: 18 Oct 18:00–20:00; day 2: 20 Oct 15:00–17:00.
const S1 = { startsAt: '2026-10-18T23:00:00.000Z', endsAt: '2026-10-19T01:00:00.000Z', durationHours: null };
const S2 = { startsAt: '2026-10-20T20:00:00.000Z', endsAt: '2026-10-20T22:00:00.000Z', durationHours: null };
const TBC1 = { startsAt: '2026-10-19T05:00:00.000Z', endsAt: '2026-10-20T04:59:00.000Z', durationHours: 2 };
const TBC2 = { startsAt: '2026-10-21T05:00:00.000Z', endsAt: '2026-10-22T04:59:00.000Z', durationHours: 1.5 };

const t = (key, vars = {}) => `${key}${JSON.stringify(vars)}`;

describe('normalizeSessions', () => {
  it('returns null for no sessions', () => {
    expect(normalizeSessions(null, false)).toBeNull();
    expect(normalizeSessions([], false)).toBeNull();
  });

  it('sorts by start, keeps ISO strings and drops the duration unless the time is to be confirmed', () => {
    expect(normalizeSessions([{ ...S2, durationHours: 4 }, S1], false)).toEqual([S1, S2]);
    expect(normalizeSessions([TBC2, { ...TBC1, durationHours: '2' }], true)).toEqual([TBC1, TBC2]);
  });

  it('turns unparseable dates into null, last in order, so the rules reject them', () => {
    const list = normalizeSessions([{ startsAt: '', endsAt: 'x' }, S1], false);
    expect(list[0]).toEqual(S1);
    expect(list[1]).toEqual({ startsAt: null, endsAt: null, durationHours: null });
    expect(validateSessions(list, false)).toEqual({ code: 'SESSION_INVALID_DATES', field: 'sessions', index: 1 });
  });
});

describe('validateSessions', () => {
  it('accepts two valid days and between 2 and 10 sessions only', () => {
    expect(validateSessions([S1, S2], false)).toBeNull();
    expect(validateSessions([S1], false)).toMatchObject({ code: 'SESSIONS_COUNT_INVALID' });
    const eleven = Array.from({ length: 11 }, (_, i) => ({
      startsAt: new Date(Date.UTC(2026, 10, 1 + i, 20)).toISOString(),
      endsAt: new Date(Date.UTC(2026, 10, 1 + i, 21)).toISOString(),
      durationHours: null,
    }));
    expect(validateSessions(eleven, false)).toMatchObject({ code: 'SESSIONS_COUNT_INVALID' });
    expect(validateSessions(eleven.slice(0, 10), false)).toBeNull();
  });

  it('says which day is wrong', () => {
    const late = { startsAt: S2.startsAt, endsAt: '2026-10-21T09:00:00.000Z', durationHours: null };
    expect(validateSessions([S1, late], false)).toEqual({ code: 'SESSION_TOO_LONG', field: 'sessions', index: 1 });
  });

  it('rejects two sessions on the same Bogotá day', () => {
    const sameDay = { startsAt: '2026-10-19T02:00:00.000Z', endsAt: '2026-10-19T03:00:00.000Z', durationHours: null };
    expect(validateSessions([S1, sameDay], false)).toMatchObject({ code: 'SESSIONS_SAME_DAY', index: 1 });
  });

  it('rejects a session that starts before the previous one ends', () => {
    // 18 Oct 22:00 → 19 Oct 10:00 Bogotá, then 19 Oct 09:00 Bogotá.
    const night = { startsAt: '2026-10-19T03:00:00.000Z', endsAt: '2026-10-19T15:00:00.000Z', durationHours: null };
    const next = { startsAt: '2026-10-19T14:00:00.000Z', endsAt: '2026-10-19T16:00:00.000Z', durationHours: null };
    expect(validateSessions([night, next], false)).toMatchObject({ code: 'SESSIONS_OVERLAP', index: 1 });
  });

  it('with the time to be confirmed every day needs a duration of 0 < h ≤ 12', () => {
    expect(validateSessions([TBC1, TBC2], true)).toBeNull();
    expect(validateSessions([TBC1, { ...TBC2, durationHours: null }], true)).toMatchObject({ code: 'SESSION_DURATION_INVALID', index: 1 });
    expect(validateSessions([{ ...TBC1, durationHours: 13 }, TBC2], true)).toMatchObject({ code: 'SESSION_DURATION_INVALID', index: 0 });
  });
});

describe('event rules with sessions', () => {
  const base = {
    modality: 'Virtual', meetingUrl: 'https://zoom.us/j/1', price: 0, tutorIds: ['t1'],
  };

  it('a multi-day repaso is not "too long" for spanning several days', () => {
    const { startsAt, endsAt } = sessionsEnvelope([S1, S2]);
    expect(validateEventDraft({ ...base, sessions: [S1, S2], startsAt, endsAt })).toBeNull();
  });

  it('without sessions the 12-hour limit still applies', () => {
    expect(validateEventDraft({ ...base, startsAt: S1.startsAt, endsAt: S2.endsAt })).toMatchObject({ code: 'TOO_LONG' });
  });

  it('a multi-day TBC repaso needs no event-level duration', () => {
    const { startsAt, endsAt } = sessionsEnvelope([TBC1, TBC2]);
    expect(validateEventDraft({ ...base, timeTbc: true, durationHours: null, sessions: [TBC1, TBC2], startsAt, endsAt })).toBeNull();
  });

  it('a WhatsApp group alone, or with the meeting link, counts as the link of a virtual repaso', () => {
    const range = { startsAt: S1.startsAt, endsAt: S1.endsAt };
    expect(validateEventDraft({ ...base, ...range, meetingUrl: null, whatsappUrl: 'https://chat.whatsapp.com/a' })).toBeNull();
    expect(validateEventDraft({ ...base, ...range, whatsappUrl: 'https://chat.whatsapp.com/a' })).toBeNull();
    expect(validateEventDraft({ ...base, ...range, meetingUrl: null })).toMatchObject({ code: 'MEETING_URL_REQUIRED' });
  });

  it('publishing looks at the first session', () => {
    const event = { ...base, sessions: [S1, S2], ...sessionsEnvelope([S1, S2]) };
    expect(assertPublishable(event, new Date('2026-10-18T22:59:00.000Z'))).toBeNull();
    expect(assertPublishable(event, new Date('2026-10-18T23:00:00.000Z'))).toMatchObject({ code: 'STARTS_IN_PAST' });
  });

  it('a TBC multi-day repaso can be published until its first day ends', () => {
    const event = { ...base, timeTbc: true, sessions: [TBC1, TBC2], ...sessionsEnvelope([TBC1, TBC2]) };
    expect(assertPublishable(event, new Date('2026-10-20T04:00:00.000Z'))).toBeNull();
    expect(assertPublishable(event, new Date('2026-10-20T05:00:00.000Z'))).toMatchObject({ code: 'STARTS_IN_PAST' });
  });
});

describe('hours', () => {
  it('adds the hours of every session, not the span between them', () => {
    expect(sessionsTotalHours([S1, S2])).toBe(4);
    expect(sessionsTotalHours([TBC1, TBC2])).toBe(3.5);
  });
});

describe('reading and formatting', () => {
  it('eventSessionsOf / multiDaySessions only return lists of 2 or more', () => {
    expect(eventSessionsOf({ sessions: null })).toBeNull();
    expect(eventSessionsOf({ sessions: [S1] })).toBeNull();
    expect(eventSessionsOf({ sessions: [S1, S2] })).toEqual([S1, S2]);
    expect(multiDaySessions({})).toBeNull();
    expect(multiDaySessions({ sessions: [S1, S2] })).toEqual([S1, S2]);
  });

  it('formatEventTime summarises a multi-day repaso with its count and first session', () => {
    expect(formatEventTime({ sessions: [S1, S2] }, 'es', t)).toMatch(/^events\.common\.sessionsSummary\{"count":2,"time":"18:00 – 20:00"/);
    expect(formatEventTime({ sessions: [TBC1, TBC2], timeTbc: true }, 'es', t))
      .toBe('events.common.sessionsSummary{"count":2,"time":"events.common.timeTbc{\\"hours\\":2}"}');
  });

  it('formatSessionTime gives the range, or "to be confirmed" with the hours of that day', () => {
    expect(formatSessionTime(S2, false, 'en', t)).toBe('15:00 – 17:00');
    expect(formatSessionTime(TBC2, true, 'en', t)).toBe('events.common.timeTbc{"hours":1.5}');
  });
});

describe('emails', () => {
  const event = {
    id: 'e1', slug: 'repaso', title: 'Repaso', modality: 'Virtual', tutors: [],
    meetingUrl: 'https://meet.google.com/abc', whatsappUrl: 'https://chat.whatsapp.com/xyz',
    sessions: [S1, S2], ...sessionsEnvelope([S1, S2]),
  };

  it('lists every day with its hours in EVENT_DATE and the count in EVENT_TIME', () => {
    const p = buildEventEmailParams(event, { name: 'Ana' });
    expect(p.EVENT_DATE).toBe('domingo, 18 de octubre (18:00 – 20:00) y martes, 20 de octubre (15:00 – 17:00)');
    expect(p.EVENT_TIME).toBe('2 sesiones');
  });

  it('with the time to be confirmed lists only the days', () => {
    const p = buildEventEmailParams({ ...event, timeTbc: true, sessions: [TBC1, TBC2] }, { name: 'Ana' });
    expect(p.EVENT_DATE).toBe('lunes, 19 de octubre y miércoles, 21 de octubre');
    expect(p.EVENT_TIME).toBe('Por confirmar');
  });

  it('sends both links: the Meet as MEETING_URL and the group as WHATSAPP_URL', () => {
    const p = buildEventEmailParams(event, { name: 'Ana' });
    expect(p.MEETING_URL).toBe('https://meet.google.com/abc');
    expect(p.WHATSAPP_URL).toBe('https://chat.whatsapp.com/xyz');
  });

  it('a single-session repaso keeps its usual date and time', () => {
    const p = buildEventEmailParams({ ...event, sessions: null, startsAt: S1.startsAt, endsAt: S1.endsAt }, { name: 'Ana' });
    expect(p.EVENT_DATE).toBe('domingo, 18 de octubre');
    expect(p.EVENT_TIME).toMatch(/^18:00 – 20:00/);
  });

  it('the .ics has one VEVENT per session', () => {
    const ics = buildEventIcs({
      uid: 'e1@calico', title: 'Repaso', startsAt: S1.startsAt, endsAt: S2.endsAt, sessions: [S1, S2],
      now: new Date('2026-10-01T00:00:00.000Z'),
    });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('UID:1-e1@calico');
    expect(ics).toContain('UID:2-e1@calico');
    expect(ics).toContain('DTSTART:20261018T230000Z');
    expect(ics).toContain('DTEND:20261019T010000Z');
    expect(ics).toContain('DTSTART:20261020T200000Z');
    expect(ics).toContain('DTEND:20261020T220000Z');
  });

  it('without sessions the .ics is a single VEVENT as before', () => {
    const ics = buildEventIcs({ uid: 'e1@calico', title: 'Repaso', startsAt: S1.startsAt, endsAt: S1.endsAt });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain('UID:e1@calico');
  });
});
