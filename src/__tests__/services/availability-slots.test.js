/**
 * Unit tests — Availability Service slot logic
 *
 * Verifies that getFreeAvailabilityByUserId returns:
 *   1. The tutor's weekly recurring blocks
 *   2. ONLY future, non-cancelled/rejected sessions
 *   3. Time fields serialized as HH:MM:SS strings (not Date objects)
 */

jest.mock('@/lib/repositories/availability.repository', () => ({
  findAvailabilityByUserId: jest.fn(),
  findScheduleByUserId: jest.fn(),
  findAvailabilityByDay: jest.fn(),
}));

jest.mock('@/lib/services/calendar.service', () => ({
  getAccessTokenOrRefresh: jest.fn(),
  listCalendars: jest.fn(),
  listEvents: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    session: {
      findMany: jest.fn(),
    },
  },
}));

const availabilityRepo = require('@/lib/repositories/availability.repository');
const prisma = require('@/lib/prisma').default;
const availabilityService = require('@/lib/services/availability.service');

const { makeAvailabilityBlock, makeSession } = require('../fixtures/booking.fixtures');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('availabilityService.getFreeAvailabilityByUserId', () => {
  it('test_should_return_blocks_and_active_future_sessions', async () => {
    const blocks = [
      makeAvailabilityBlock({
        id: 'av_mon',
        dayOfWeek: 1,
        startTime: '08:00:00',
        endTime: '12:00:00',
      }),
    ];
    const sessions = [
      makeSession({ id: 'sess_future_pending', status: 'Pending' }),
    ];
    availabilityRepo.findAvailabilityByUserId.mockResolvedValue(blocks);
    prisma.session.findMany.mockResolvedValue(sessions);

    const result = await availabilityService.getFreeAvailabilityByUserId(99);

    expect(availabilityRepo.findAvailabilityByUserId).toHaveBeenCalledWith(99);
    expect(result.availabilities).toEqual([
      expect.objectContaining({
        id: 'av_mon',
        dayOfWeek: 1,
        startTime: '08:00:00',
        endTime: '12:00:00',
      }),
    ]);
    expect(result.bookedSessions).toEqual(sessions);
  });

  it('test_should_query_only_pending_or_accepted_status_sessions_in_the_future', async () => {
    availabilityRepo.findAvailabilityByUserId.mockResolvedValue([]);
    prisma.session.findMany.mockResolvedValue([]);

    await availabilityService.getFreeAvailabilityByUserId(99);

    const args = prisma.session.findMany.mock.calls[0][0];
    expect(args.where.tutorId).toBe(99);
    expect(args.where.status).toEqual({ in: ['Pending', 'Accepted'] });
    // Future-only filter
    expect(args.where.startTimestamp.gte).toBeInstanceOf(Date);
    expect(args.where.startTimestamp.gte.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('test_should_serialize_prisma_time_dates_to_HHMMSS_strings', async () => {
    // Prisma maps PostgreSQL TIME → 1970-01-01 UTC Date. Service must coerce to wall-clock string.
    const blocks = [
      makeAvailabilityBlock({
        startTime: new Date('1970-01-01T09:00:00.000Z'),
        endTime: new Date('1970-01-01T11:30:00.000Z'),
      }),
    ];
    availabilityRepo.findAvailabilityByUserId.mockResolvedValue(blocks);
    prisma.session.findMany.mockResolvedValue([]);

    const result = await availabilityService.getFreeAvailabilityByUserId(99);

    expect(result.availabilities[0].startTime).toBe('09:00:00');
    expect(result.availabilities[0].endTime).toBe('11:30:00');
  });

  it('test_should_return_empty_lists_when_tutor_has_no_blocks_or_sessions', async () => {
    availabilityRepo.findAvailabilityByUserId.mockResolvedValue([]);
    prisma.session.findMany.mockResolvedValue([]);

    const result = await availabilityService.getFreeAvailabilityByUserId(99);

    expect(result).toEqual({ availabilities: [], bookedSessions: [] });
  });
});
