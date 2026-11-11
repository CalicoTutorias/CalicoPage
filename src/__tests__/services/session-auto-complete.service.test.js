/**
 * @jest-environment node
 *
 * The daily job (GET /api/cron/complete-sessions) that completes ended sessions
 * nobody completed: who gets notified, and how failures are counted.
 */

jest.mock('@/lib/repositories/session.repository', () => ({ findSessionsToAutoComplete: jest.fn() }));
jest.mock('@/lib/services/session.service', () => ({ completeSession: jest.fn() }));

const sessionRepo = require('@/lib/repositories/session.repository');
const { completeSession } = require('@/lib/services/session.service');
const service = require('@/lib/services/session-auto-complete.service');

const NOW = new Date('2026-11-12T11:00:00.000Z');
const DAY = 24 * 60 * 60_000;

const row = (id, endedDaysAgo, kinds = ['Registered']) => ({
  id,
  tutorId: 't1',
  endTimestamp: new Date(NOW.getTime() - endedDaysAgo * DAY),
  participants: kinds.map((kind) => ({ student: { kind } })),
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  completeSession.mockResolvedValue({});
});

afterEach(() => jest.restoreAllMocks());

it('only looks at sessions that ended over an hour ago', async () => {
  sessionRepo.findSessionsToAutoComplete.mockResolvedValue([]);

  await service.autoCompleteEndedSessions({ now: NOW });

  expect(sessionRepo.findSessionsToAutoComplete).toHaveBeenCalledWith({
    endedBefore: new Date('2026-11-12T10:00:00.000Z'),
    limit: 200,
  });
});

it('notifies for a recent session and completes an old one quietly', async () => {
  sessionRepo.findSessionsToAutoComplete.mockResolvedValue([row('recent', 1), row('old', 30)]);

  const result = await service.autoCompleteEndedSessions({ now: NOW });

  expect(completeSession).toHaveBeenCalledWith('recent', 't1', { withReviews: true, promptStudents: true, remindTutor: true });
  expect(completeSession).toHaveBeenCalledWith('old', 't1', { withReviews: true, promptStudents: false, remindTutor: false });
  expect(result).toEqual({ found: 2, completed: 2, skipped: 0, failed: 0 });
});

it('creates no reviews for a session whose only student is anonymous', async () => {
  sessionRepo.findSessionsToAutoComplete.mockResolvedValue([row('anon', 1, ['ExternalTemporary'])]);

  await service.autoCompleteEndedSessions({ now: NOW });

  expect(completeSession).toHaveBeenCalledWith('anon', 't1', expect.objectContaining({ withReviews: false }));
});

it('counts one completed elsewhere as skipped and keeps going after a failure', async () => {
  sessionRepo.findSessionsToAutoComplete.mockResolvedValue([row('a', 1), row('b', 1), row('c', 1)]);
  completeSession
    .mockRejectedValueOnce(Object.assign(new Error('taken'), { code: 'INVALID_STATUS' }))
    .mockRejectedValueOnce(Object.assign(new Error('db down'), { code: 'P1001' }))
    .mockResolvedValueOnce({});

  const result = await service.autoCompleteEndedSessions({ now: NOW });

  expect(result).toEqual({ found: 3, completed: 1, skipped: 1, failed: 1 });
});
