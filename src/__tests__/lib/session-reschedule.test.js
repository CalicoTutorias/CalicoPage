/**
 * Rules of a reschedule by agreement (src/lib/sessions/reschedule.js) and the
 * emails that go with it (src/lib/emails/session-reschedule.js).
 */
import {
  RESCHEDULE_MAX_DAYS_AHEAD,
  cleanRescheduleMessage,
  isRescheduleRequestOpen,
  proposedStartBlocker,
  rescheduleRoleOf,
  rescheduleSessionBlocker,
  rescheduledEnd,
} from '@/lib/sessions/reschedule';
import { sessionRescheduleEmail } from '@/lib/emails/session-reschedule';

const NOW = new Date('2026-12-01T15:00:00.000Z');
const HOUR = 60 * 60_000;
const at = (hours) => new Date(NOW.getTime() + hours * HOUR);

function session(overrides = {}) {
  return {
    id: 's1',
    tutorId: 'tutor',
    status: 'Accepted',
    startTimestamp: at(24),
    endTimestamp: at(25.5),
    participants: [{ studentId: 'organizer' }, { studentId: 'guest' }],
    payments: [{ studentId: 'organizer' }],
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    status: 'Pending',
    requestedById: 'organizer',
    respondentId: 'tutor',
    fromStart: at(24),
    toStart: at(48),
    ...overrides,
  };
}

describe('rescheduleRoleOf', () => {
  it('tells the tutor, the student who booked and the guests apart', () => {
    expect(rescheduleRoleOf(session(), 'tutor')).toBe('tutor');
    expect(rescheduleRoleOf(session(), 'organizer')).toBe('organizer');
    expect(rescheduleRoleOf(session(), 'guest')).toBe('guest');
    expect(rescheduleRoleOf(session(), 'stranger')).toBeNull();
    expect(rescheduleRoleOf(session(), null)).toBeNull();
  });

  it('takes whoever paid as the one who booked, not the first to join', () => {
    const s = session({ participants: [{ studentId: 'guest' }, { studentId: 'organizer' }] });
    expect(rescheduleRoleOf(s, 'organizer')).toBe('organizer');
    expect(rescheduleRoleOf(s, 'guest')).toBe('guest');
  });

  it('falls back to the first participant when the session has no payment', () => {
    expect(rescheduleRoleOf(session({ payments: [] }), 'organizer')).toBe('organizer');
  });

  it('reads `organizerId` from a student payload whose payments were stripped', () => {
    const scoped = session({ payments: [], organizerId: 'organizer', participants: [{ studentId: 'guest' }, { studentId: 'organizer' }] });
    expect(rescheduleRoleOf(scoped, 'guest')).toBe('guest');
    expect(rescheduleRoleOf(scoped, 'organizer')).toBe('organizer');
  });
});

describe('rescheduleSessionBlocker', () => {
  it('allows a Pending or Accepted session that has not started', () => {
    expect(rescheduleSessionBlocker(session(), NOW)).toBeNull();
    expect(rescheduleSessionBlocker(session({ status: 'Pending' }), NOW)).toBeNull();
  });

  it.each(['Canceled', 'Completed', 'Rejected'])('refuses a %s session', (status) => {
    expect(rescheduleSessionBlocker(session({ status }), NOW)).toBe('SESSION_NOT_ACTIVE');
  });

  it('refuses once the session has started', () => {
    expect(rescheduleSessionBlocker(session({ startTimestamp: NOW }), NOW)).toBe('SESSION_STARTED');
    expect(rescheduleSessionBlocker(session({ startTimestamp: at(-1) }), NOW)).toBe('SESSION_STARTED');
  });
});

describe('proposedStartBlocker', () => {
  it('accepts a future time different from the current one', () => {
    expect(proposedStartBlocker(session(), at(48), NOW)).toBeNull();
    // Earlier than the current time is fine too, as long as it is still ahead.
    expect(proposedStartBlocker(session(), at(2), NOW)).toBeNull();
  });

  it('refuses the past, the same time, a far date and garbage', () => {
    expect(proposedStartBlocker(session(), at(-1), NOW)).toBe('START_IN_PAST');
    expect(proposedStartBlocker(session(), NOW, NOW)).toBe('START_IN_PAST');
    expect(proposedStartBlocker(session(), at(24), NOW)).toBe('SAME_TIME');
    expect(proposedStartBlocker(session(), at(24 * (RESCHEDULE_MAX_DAYS_AHEAD + 1)), NOW)).toBe('TOO_FAR_AHEAD');
    expect(proposedStartBlocker(session(), 'mañana', NOW)).toBe('INVALID_TIME');
    expect(proposedStartBlocker(session(), null, NOW)).toBe('INVALID_TIME');
  });
});

describe('rescheduledEnd', () => {
  it('keeps the duration of the session', () => {
    expect(rescheduledEnd(session(), at(48))).toEqual(at(49.5));
  });
});

describe('isRescheduleRequestOpen', () => {
  it('is open while pending, about the session as it is, and still ahead', () => {
    expect(isRescheduleRequestOpen(request(), session(), NOW)).toBe(true);
    // Dates may arrive as ISO strings (JSON payloads).
    const json = JSON.parse(JSON.stringify(request()));
    expect(isRescheduleRequestOpen(json, JSON.parse(JSON.stringify(session())), NOW)).toBe(true);
  });

  it.each(['Accepted', 'Declined', 'Withdrawn', 'Expired'])('is closed once %s', (status) => {
    expect(isRescheduleRequestOpen(request({ status }), session(), NOW)).toBe(false);
  });

  it('is closed when the session is no longer active or already started', () => {
    expect(isRescheduleRequestOpen(request(), session({ status: 'Canceled' }), NOW)).toBe(false);
    expect(isRescheduleRequestOpen(request({ fromStart: at(-1) }), session({ startTimestamp: at(-1) }), NOW)).toBe(false);
  });

  it('is closed when the session moved since it was proposed', () => {
    expect(isRescheduleRequestOpen(request(), session({ startTimestamp: at(30) }), NOW)).toBe(false);
  });

  it('is closed when the proposed time has passed', () => {
    expect(isRescheduleRequestOpen(request({ toStart: at(-0.5) }), session(), NOW)).toBe(false);
  });

  it('is closed when the session went to another tutor', () => {
    expect(isRescheduleRequestOpen(request(), session({ tutorId: 'another-tutor' }), NOW)).toBe(false);
  });

  it('handles a missing request', () => {
    expect(isRescheduleRequestOpen(null, session(), NOW)).toBe(false);
  });
});

describe('cleanRescheduleMessage', () => {
  it('trims, collapses whitespace and turns empty into null', () => {
    expect(cleanRescheduleMessage('  se me cruzó\n\n un parcial  ')).toBe('se me cruzó un parcial');
    expect(cleanRescheduleMessage('   ')).toBeNull();
    expect(cleanRescheduleMessage(null)).toBeNull();
  });
});

describe('sessionRescheduleEmail', () => {
  const params = {
    actorName: 'Laura',
    courseName: 'Cálculo',
    fromTime: '2 de diciembre, 10:00 a. m.',
    toTime: '3 de diciembre, 4:00 p. m.',
    sessionLink: 'https://calico.test/sessions/abc/detail',
  };

  it('asks whoever must answer, with both times, the note and the link', () => {
    const { subject, htmlContent } = sessionRescheduleEmail('requested', { ...params, message: 'Tengo parcial' });
    expect(subject).toBe('Laura te propone cambiar el horario de tu tutoría de Cálculo');
    expect(htmlContent).toContain('2 de diciembre, 10:00 a. m.');
    expect(htmlContent).toContain('3 de diciembre, 4:00 p. m.');
    expect(htmlContent).toContain('Tengo parcial');
    expect(htmlContent).toContain('href="https://calico.test/sessions/abc/detail"');
    expect(htmlContent).toContain('Responder');
  });

  it('tells whoever proposed the answer, without repeating their own note', () => {
    const accepted = sessionRescheduleEmail('accepted', { ...params, message: 'Tengo parcial' });
    expect(accepted.subject).toBe('Tu tutoría de Cálculo cambió de horario');
    expect(accepted.htmlContent).toContain('Laura aceptó el cambio de horario');
    expect(accepted.htmlContent).not.toContain('Tengo parcial');

    const declined = sessionRescheduleEmail('declined', params);
    expect(declined.subject).toBe('Tu tutoría de Cálculo sigue en su horario');
    expect(declined.htmlContent).toContain('Laura no aceptó el cambio de horario');
  });

  it('escapes everything that comes from a person', () => {
    const { htmlContent } = sessionRescheduleEmail('requested', {
      ...params,
      actorName: '<img src=x onerror=alert(1)>',
      courseName: 'A & B <b>',
      message: '<script>alert(1)</script>',
    });
    expect(htmlContent).not.toContain('<img src=x');
    expect(htmlContent).not.toContain('<script>');
    expect(htmlContent).toContain('&lt;script&gt;');
    expect(htmlContent).toContain('A &amp; B &lt;b&gt;');
  });
});
