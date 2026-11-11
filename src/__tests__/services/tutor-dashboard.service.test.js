/**
 * @jest-environment node
 *
 * Unit tests for src/lib/services/tutor-dashboard.service.js: the tutor home
 * figures. The repository is mocked; the fee math and tutorPayoutStateOf are REAL.
 */

jest.mock('@/lib/repositories/tutor-dashboard.repository', () => ({
  findTutorSessions: jest.fn(),
  findTutorPayments: jest.fn(),
}));

const repo = require('@/lib/repositories/tutor-dashboard.repository');
const service = require('@/lib/services/tutor-dashboard.service');

// Wednesday 2026-11-11, 17:30 in Bogotá. The week started Monday 2026-11-09 00:00 Bogotá.
const NOW = new Date('2026-11-11T22:30:00.000Z');
const HOUR = 60 * 60_000;

let seq = 0;
function session({ start, hours = 1, status = 'Accepted', students = ['ana'] }) {
  const startTimestamp = new Date(start);
  return {
    id: `s${++seq}`,
    status,
    startTimestamp,
    endTimestamp: new Date(startTimestamp.getTime() + hours * HOUR),
    participants: students.map((studentId) => ({ studentId })),
  };
}

function payment({ start, amount = 40000, status = 'paid', sessionStatus = 'Accepted', payout = 'pending', code = 'ISIS1221' }) {
  const startTimestamp = new Date(start);
  return {
    id: `p${++seq}`,
    amount: String(amount),
    tutorPayoutBase: String(amount),
    status,
    tutorPayoutStatus: payout,
    session: {
      status: sessionStatus,
      startTimestamp,
      endTimestamp: new Date(startTimestamp.getTime() + HOUR),
      course: { code },
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  repo.findTutorSessions.mockResolvedValue([]);
  repo.findTutorPayments.mockResolvedValue([]);
});

describe('bogotaWeekRange', () => {
  it('starts on Monday 00:00 in Bogotá', () => {
    const { start, end } = service.bogotaWeekRange(NOW);
    expect(start.toISOString()).toBe('2026-11-09T05:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-16T05:00:00.000Z');
  });

  it('keeps Sunday night in Bogotá inside the week that is ending', () => {
    // Sunday 2026-11-15 23:00 Bogotá = Monday 04:00 UTC
    const { start } = service.bogotaWeekRange(new Date('2026-11-16T04:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-11-09T05:00:00.000Z');
  });
});

describe('getTutorDashboardStats', () => {
  it('counts an Accepted session that already ended as held, not only Completed ones', async () => {
    repo.findTutorSessions.mockResolvedValue([
      session({ start: '2026-11-11T16:00:00Z' }),                       // ended today, Accepted
      session({ start: '2026-11-07T16:00:00Z', status: 'Completed' }),
      session({ start: '2026-11-12T16:00:00Z' }),                       // tomorrow
    ]);

    const stats = await service.getTutorDashboardStats('t1', { now: NOW });

    expect(stats.held).toBe(2);
    expect(stats.scheduled).toBe(1);
  });

  it('keeps a session in progress among the scheduled ones', async () => {
    repo.findTutorSessions.mockResolvedValue([session({ start: '2026-11-11T22:00:00Z' })]);

    const stats = await service.getTutorDashboardStats('t1', { now: NOW });

    expect(stats.scheduled).toBe(1);
    expect(stats.held).toBe(0);
  });

  it('counts the sessions of this week, held or to come, and not those of last week', async () => {
    repo.findTutorSessions.mockResolvedValue([
      session({ start: '2026-11-09T14:00:00Z' }),  // Monday
      session({ start: '2026-11-14T14:00:00Z' }),  // Saturday, still to come
      session({ start: '2026-11-07T16:00:00Z' }),  // last Saturday
    ]);

    const stats = await service.getTutorDashboardStats('t1', { now: NOW });

    expect(stats.weeklySessions).toBe(2);
  });

  it('earns 85 % of what the students paid for sessions that happened', async () => {
    repo.findTutorPayments.mockResolvedValue([
      payment({ start: '2026-11-11T16:00:00Z', amount: 35000 }),                      // this week, owed
      payment({ start: '2026-11-07T16:00:00Z', amount: 40000, payout: 'paid' }),      // last week, transferred
    ]);

    const stats = await service.getTutorDashboardStats('t1', { now: NOW });

    expect(stats.weeklyEarnings).toBe(29750);
    expect(stats.totalEarnings).toBe(29750 + 34000);
  });

  it('does not count money the student has not paid, a session to come, a canceled one or a test course', async () => {
    repo.findTutorPayments.mockResolvedValue([
      payment({ start: '2026-11-11T16:00:00Z', status: 'pending' }),           // manual without proof
      payment({ start: '2026-11-13T16:00:00Z' }),                              // still to come
      payment({ start: '2026-11-10T16:00:00Z', sessionStatus: 'Canceled' }),
      payment({ start: '2026-11-10T18:00:00Z', code: 'TEST123' }),
    ]);

    const stats = await service.getTutorDashboardStats('t1', { now: NOW });

    expect(stats.totalEarnings).toBe(0);
    expect(stats.weeklyEarnings).toBe(0);
  });

  it('gives the share of students who came back for a second held session', async () => {
    repo.findTutorSessions.mockResolvedValue([
      session({ start: '2026-11-07T16:00:00Z', students: ['ana'] }),
      session({ start: '2026-11-11T16:00:00Z', students: ['ana'] }),
      session({ start: '2026-11-10T16:00:00Z', students: ['beto'] }),
      session({ start: '2026-11-12T16:00:00Z', students: ['beto'] }), // not held yet
    ]);

    const stats = await service.getTutorDashboardStats('t1', { now: NOW });

    expect(stats.studentRetention).toBe(50);
  });

  it('answers null retention while no session was held', async () => {
    repo.findTutorSessions.mockResolvedValue([session({ start: '2026-11-12T16:00:00Z' })]);

    const stats = await service.getTutorDashboardStats('t1', { now: NOW });

    expect(stats.studentRetention).toBeNull();
  });

  it('covers one course when asked, for the tutor course page', async () => {
    await service.getTutorDashboardStats('t1', { now: NOW, courseId: 'c1' });

    expect(repo.findTutorSessions).toHaveBeenCalledWith('t1', { courseId: 'c1' });
    expect(repo.findTutorPayments).toHaveBeenCalledWith('t1', { courseId: 'c1' });
  });
});
