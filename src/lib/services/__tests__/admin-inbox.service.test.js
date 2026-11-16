/**
 * @jest-environment node
 *
 * admin-inbox.service.getInbox — bandeja «Requiere acción» del Inicio.
 */

jest.mock('@/lib/repositories/admin-inbox.repository', () => ({
  pendingApplicationsSummary: jest.fn(),
  pendingCourseRequestsCount: jest.fn(),
  pendingSuggestionsSummary: jest.fn(),
  pendingEventApprovalsByEvent: jest.fn(),
  pendingSessionsStartingSoon: jest.fn(),
}));
jest.mock('@/lib/services/admin-sessions.service', () => ({ listUnbookedPayments: jest.fn() }));
jest.mock('@/lib/services/payouts.service', () => ({ listPendingPayoutsByTutor: jest.fn() }));
jest.mock('@/lib/services/course-notify.service', () => ({ getRecruitmentDemand: jest.fn() }));

const repo = require('@/lib/repositories/admin-inbox.repository');
const adminSessions = require('@/lib/services/admin-sessions.service');
const payouts = require('@/lib/services/payouts.service');
const courseNotify = require('@/lib/services/course-notify.service');
const { getInbox, bogotaWeekday, INBOX_KEYS } = require('@/lib/services/admin-inbox.service');

// Miércoles 18 nov 2026, 15:00 en Bogotá (20:00 UTC).
const NOW = new Date('2026-11-18T20:00:00.000Z');
const daysAgo = (d) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);
const byKey = (inbox) => Object.fromEntries(inbox.items.map((it) => [it.key, it]));

function emptyQueues() {
  adminSessions.listUnbookedPayments.mockResolvedValue([]);
  repo.pendingApplicationsSummary.mockResolvedValue({ count: 0, oldestAt: null });
  courseNotify.getRecruitmentDemand.mockResolvedValue([]);
  repo.pendingEventApprovalsByEvent.mockResolvedValue([]);
  payouts.listPendingPayoutsByTutor.mockResolvedValue({ totals: { tutorsCount: 0, tutorOwed: 0, paymentsCount: 0 } });
  repo.pendingCourseRequestsCount.mockResolvedValue(0);
  repo.pendingSuggestionsSummary.mockResolvedValue({ count: 0, oldestAt: null });
  repo.pendingSessionsStartingSoon.mockResolvedValue({ count: 0, nextAt: null });
}

beforeEach(() => {
  jest.clearAllMocks();
  emptyQueues();
});

it('returns every queue in priority order, all caught up when empty', async () => {
  const inbox = await getInbox({ now: NOW });
  expect(inbox.items.map((it) => it.key)).toEqual(INBOX_KEYS);
  expect(inbox.items.every((it) => it.ok && it.count === 0 && it.severity === 'ok' && !it.overdue)).toBe(true);
});

it('flags unbooked payments as critical and overdue after a day', async () => {
  adminSessions.listUnbookedPayments.mockResolvedValue([
    { createdAt: daysAgo(2) }, { createdAt: daysAgo(0.1) },
  ]);
  const { unbooked } = byKey(await getInbox({ now: NOW }));
  expect(unbooked).toMatchObject({ count: 2, severity: 'critical', overdue: true });
  expect(unbooked.oldestAt).toEqual(daysAgo(2));
});

it('marks applications overdue only past 48 h', async () => {
  repo.pendingApplicationsSummary.mockResolvedValue({ count: 3, oldestAt: daysAgo(1) });
  expect(byKey(await getInbox({ now: NOW })).applications).toMatchObject({ severity: 'high', overdue: false });

  repo.pendingApplicationsSummary.mockResolvedValue({ count: 3, oldestAt: daysAgo(3) });
  expect(byKey(await getInbox({ now: NOW })).applications).toMatchObject({ severity: 'high', overdue: true });
});

it('counts only uncovered courses for recruitment and keeps the top ones', async () => {
  courseNotify.getRecruitmentDemand.mockResolvedValue([
    { courseId: 'a', waiting: 5, oldestAt: daysAgo(4), needsTutor: true },
    { courseId: 'b', waiting: 2, oldestAt: daysAgo(9), needsTutor: true },
    { courseId: 'c', waiting: 7, oldestAt: daysAgo(1), needsTutor: false },
  ]);
  const { recruitment } = byKey(await getInbox({ now: NOW }));
  expect(recruitment).toMatchObject({ count: 2, waitingStudents: 7, severity: 'high' });
  expect(recruitment.top.map((c) => c.courseId)).toEqual(['a', 'b']);
  expect(recruitment.oldestAt).toEqual(daysAgo(9));
});

it('raises event approvals to high when an event is within 3 days', async () => {
  repo.pendingEventApprovalsByEvent.mockResolvedValue([
    { eventId: 'e1', title: 'Repaso', startsAt: new Date(NOW.getTime() + 10 * 24 * 3600e3), count: 2, oldestAt: daysAgo(1) },
  ]);
  expect(byKey(await getInbox({ now: NOW })).eventApprovals).toMatchObject({ count: 2, severity: 'medium' });

  repo.pendingEventApprovalsByEvent.mockResolvedValue([
    { eventId: 'e2', title: 'Parcial', startsAt: new Date(NOW.getTime() + 2 * 24 * 3600e3), count: 1, oldestAt: daysAgo(1) },
    { eventId: 'e1', title: 'Repaso', startsAt: new Date(NOW.getTime() + 10 * 24 * 3600e3), count: 2, oldestAt: daysAgo(1) },
  ]);
  const { eventApprovals } = byKey(await getInbox({ now: NOW }));
  expect(eventApprovals).toMatchObject({ count: 3, eventsCount: 2, severity: 'high' });
  expect(eventApprovals.nextEvent).toMatchObject({ id: 'e2', count: 1 });
});

it('raises payouts to high only on the weekly cutoff day', async () => {
  payouts.listPendingPayoutsByTutor.mockResolvedValue({ totals: { tutorsCount: 4, tutorOwed: 340000, paymentsCount: 9 } });
  const wednesday = byKey(await getInbox({ now: NOW })).payouts;
  expect(wednesday).toMatchObject({ count: 4, amountOwed: 340000, severity: 'medium', cutoffToday: false, cutoffWeekday: 5 });

  const friday = new Date('2026-11-20T20:00:00.000Z');
  expect(byKey(await getInbox({ now: friday })).payouts).toMatchObject({ severity: 'high', cutoffToday: true });
});

it('isolates a failing source to its own card', async () => {
  repo.pendingSuggestionsSummary.mockRejectedValue(new Error('db down'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const inbox = byKey(await getInbox({ now: NOW }));
  expect(inbox.suggestions).toEqual({ key: 'suggestions', ok: false });
  expect(inbox.applications.ok).toBe(true);
  console.error.mockRestore();
});

it('computes the weekday in Bogotá time, not UTC', () => {
  // Sábado 21 nov 2026 02:00 UTC = viernes 20 nov 21:00 en Bogotá.
  expect(bogotaWeekday(new Date('2026-11-21T02:00:00.000Z'))).toBe(5);
});
