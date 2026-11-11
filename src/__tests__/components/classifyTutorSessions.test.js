/**
 * Unit tests for the tabs of the tutor home (TutorSessionsPanel): which session
 * goes to Today / Upcoming / History, its badge, and when the Meet button shows.
 */

import {
  classifyTutorSessions,
  sessionPhase,
  canJoinNow,
} from '@/app/components/TutorSessionsPanel/classifyTutorSessions';

// Local times: the panel groups by the browser's day.
const at = (h, m = 0, dayOffset = 0) => new Date(2026, 10, 11 + dayOffset, h, m);
const NOW = at(11, 30);

function session(id, start, { minutes = 60, status = 'Accepted', meet = 'https://meet.google.com/abc' } = {}) {
  return {
    id,
    status,
    startTimestamp: start.toISOString(),
    endTimestamp: new Date(start.getTime() + minutes * 60_000).toISOString(),
    googleMeetLink: meet,
  };
}

describe('classifyTutorSessions', () => {
  it('keeps every session of today in Today, ended or in progress, earliest first', () => {
    const live = session('live', at(11, 0));
    const ended = session('ended', at(8, 0));
    const later = session('later', at(16, 0));

    const { today, upcoming, history } = classifyTutorSessions([later, live, ended], NOW);

    expect(today.map((s) => s.id)).toEqual(['ended', 'live', 'later']);
    expect(upcoming).toEqual([]);
    expect(history).toEqual([]);
  });

  it('puts later days in Upcoming and earlier ones in History, latest first', () => {
    const tomorrow = session('tomorrow', at(9, 0, 1));
    const nextWeek = session('nextWeek', at(9, 0, 7));
    const yesterday = session('yesterday', at(9, 0, -1));
    const lastWeek = session('lastWeek', at(9, 0, -7));

    const { upcoming, history } = classifyTutorSessions([nextWeek, lastWeek, tomorrow, yesterday], NOW);

    expect(upcoming.map((s) => s.id)).toEqual(['tomorrow', 'nextWeek']);
    expect(history.map((s) => s.id)).toEqual(['yesterday', 'lastWeek']);
  });

  it('sends canceled and rejected sessions to History, even when they were for today or later', () => {
    const canceledToday = session('c1', at(15, 0), { status: 'Canceled' });
    const rejectedTomorrow = session('c2', at(9, 0, 1), { status: 'Rejected' });

    const { today, upcoming, history } = classifyTutorSessions([canceledToday, rejectedTomorrow], NOW);

    expect(today).toEqual([]);
    expect(upcoming).toEqual([]);
    expect(history.map((s) => s.id)).toEqual(['c2', 'c1']);
  });
});

describe('sessionPhase', () => {
  it('tells live, ended, scheduled, pending and canceled apart', () => {
    expect(sessionPhase(session('a', at(11, 0)), NOW)).toBe('live');
    expect(sessionPhase(session('b', at(8, 0)), NOW)).toBe('ended');
    expect(sessionPhase(session('c', at(16, 0)), NOW)).toBe('scheduled');
    expect(sessionPhase(session('d', at(16, 0), { status: 'Pending' }), NOW)).toBe('pending');
    expect(sessionPhase(session('e', at(16, 0), { status: 'Canceled' }), NOW)).toBe('canceled');
  });
});

describe('canJoinNow', () => {
  it('shows the Meet button from 15 minutes before the start until the end', () => {
    const s = session('a', at(12, 0), { minutes: 90 });

    expect(canJoinNow(s, at(11, 44))).toBe(false);
    expect(canJoinNow(s, at(11, 45))).toBe(true);
    expect(canJoinNow(s, at(13, 29))).toBe(true);
    expect(canJoinNow(s, at(13, 30))).toBe(false);
  });

  it('never shows it without a link or for a session that is not Accepted', () => {
    expect(canJoinNow(session('a', at(11, 0), { meet: null }), NOW)).toBe(false);
    expect(canJoinNow(session('b', at(11, 0), { status: 'Pending' }), NOW)).toBe(false);
  });
});
