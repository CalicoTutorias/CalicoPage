/**
 * Sorts a tutor's sessions into the three tabs of the tutor home, by the
 * browser's local day:
 *   today    — every session that starts today, canceled ones aside, earliest first
 *   upcoming — Pending/Accepted sessions from tomorrow on, earliest first
 *   history  — sessions of earlier days, plus any canceled or rejected one, latest first
 *
 * A session in progress stays in "today" until the day ends, so its Meet link
 * is one click away while it is happening.
 */

const CLOSED = new Set(['Canceled', 'Rejected']);
const JOIN_EARLY_MS = 15 * 60_000;

const time = (value) => new Date(value).getTime();

function startOfDay(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function classifyTutorSessions(sessions, now = new Date()) {
  const todayStart = startOfDay(now);
  const tomorrowStart = todayStart + 24 * 60 * 60_000;
  const today = [];
  const upcoming = [];
  const history = [];

  for (const session of sessions ?? []) {
    if (!session?.startTimestamp) continue;
    const start = time(session.startTimestamp);
    const closed = CLOSED.has(session.status);

    if (!closed && start >= todayStart && start < tomorrowStart) today.push(session);
    else if (!closed && start >= tomorrowStart && ['Pending', 'Accepted'].includes(session.status)) upcoming.push(session);
    else if (closed || start < todayStart) history.push(session);
  }

  const asc = (a, b) => time(a.startTimestamp) - time(b.startTimestamp);
  today.sort(asc);
  upcoming.sort(asc);
  history.sort((a, b) => asc(b, a));
  return { today, upcoming, history };
}

/**
 * Where a session stands right now, for its badge:
 * 'live' | 'ended' | 'pending' | 'canceled' | 'scheduled'.
 */
export function sessionPhase(session, now = new Date()) {
  if (CLOSED.has(session.status)) return 'canceled';
  if (session.status === 'Pending') return 'pending';
  const t = now.getTime();
  if (t >= time(session.endTimestamp)) return 'ended';
  if (t >= time(session.startTimestamp)) return 'live';
  return 'scheduled';
}

/** The Meet button shows from 15 minutes before the start until the end. */
export function canJoinNow(session, now = new Date()) {
  if (!session.googleMeetLink || session.status !== 'Accepted') return false;
  const t = now.getTime();
  return t >= time(session.startTimestamp) - JOIN_EARLY_MS && t < time(session.endTimestamp);
}
