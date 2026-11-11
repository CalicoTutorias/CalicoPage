/**
 * @jest-environment node
 *
 * The student's review completes its session (review.service → completeSession):
 * without it, sessions stayed Accepted forever because no screen completes them.
 */

jest.mock('@/lib/repositories/review.repository', () => ({
  findBySession: jest.fn(),
  upsertReview: jest.fn(),
  updateTutorReviewStats: jest.fn(),
}));
jest.mock('@/lib/repositories/session.repository', () => ({ findById: jest.fn() }));
jest.mock('@/lib/repositories/user.repository', () => ({ findById: jest.fn() }));
jest.mock('@/lib/services/notification.service', () => ({ notifyReviewReceived: jest.fn() }));
jest.mock('@/lib/services/session.service', () => ({ completeSession: jest.fn() }));

const reviewRepo = require('@/lib/repositories/review.repository');
const sessionRepo = require('@/lib/repositories/session.repository');
const userRepo = require('@/lib/repositories/user.repository');
const { completeSession } = require('@/lib/services/session.service');
const reviewService = require('@/lib/services/review.service');

const ENDED = new Date(Date.now() - 2 * 60 * 60_000);

function storedSession(overrides = {}) {
  return {
    id: 's1',
    tutorId: 't1',
    courseId: 'c1',
    status: 'Accepted',
    endTimestamp: ENDED,
    participants: [{ studentId: 'st1' }],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  sessionRepo.findById.mockResolvedValue(storedSession());
  reviewRepo.findBySession.mockResolvedValue([]);
  reviewRepo.upsertReview.mockResolvedValue({ id: 'r1', status: 'done' });
  userRepo.findById.mockResolvedValue({ id: 'st1', name: 'Ana' });
  completeSession.mockResolvedValue({});
});

afterEach(() => jest.restoreAllMocks());

const review = () => reviewService.createReview('s1', 'st1', { tutorId: 't1', rating: 5, comment: 'Muy bien' });

it('completes an Accepted session, without asking its only student to review again', async () => {
  await review();

  expect(completeSession).toHaveBeenCalledWith('s1', 't1', { promptStudents: false });
});

it('still prompts the other students of a group session', async () => {
  sessionRepo.findById.mockResolvedValue(storedSession({ participants: [{ studentId: 'st1' }, { studentId: 'st2' }] }));

  await review();

  expect(completeSession).toHaveBeenCalledWith('s1', 't1', { promptStudents: true });
});

it('leaves an already Completed session alone', async () => {
  sessionRepo.findById.mockResolvedValue(storedSession({ status: 'Completed' }));

  await review();

  expect(completeSession).not.toHaveBeenCalled();
});

it('keeps the review when completing fails', async () => {
  completeSession.mockRejectedValue(Object.assign(new Error('db down'), { code: 'P1001' }));

  const result = await review();

  expect(result.review).toEqual({ id: 'r1', status: 'done' });
});
