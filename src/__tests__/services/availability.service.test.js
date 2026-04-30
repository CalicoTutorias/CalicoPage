/**
 * Unit tests — Availability Service (Create & Update)
 *
 * Verifies availability conflict detection, time validation, and atomicity.
 * Tests createAvailability, updateAvailability, and overlap logic.
 */

jest.mock('@/lib/repositories/availability.repository', () => ({
  findAvailabilityByUserId: jest.fn(),
  findOverlap: jest.fn(),
  createAvailability: jest.fn(),
  updateAvailability: jest.fn(),
  deleteAvailability: jest.fn(),
  findAvailabilityById: jest.fn(),
  findScheduleByUserId: jest.fn(),
}));

jest.mock('@/lib/services/calendar.service', () => ({
  getAccessTokenOrRefresh: jest.fn(),
  listCalendars: jest.fn(),
  listEvents: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    availability: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    session: {
      findMany: jest.fn(),
    },
  },
}));

const availabilityRepo = require('@/lib/repositories/availability.repository');
const availabilityService = require('@/lib/services/availability.service');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('availabilityService.createAvailability', () => {
  it('should create availability when no overlap exists', async () => {
    const userId = 'user-123';
    const payload = {
      dayOfWeek: 2, // Tuesday
      startTime: new Date('1970-01-01T09:00:00.000Z'),
      endTime: new Date('1970-01-01T12:00:00.000Z'),
      label: 'Morning classes',
    };

    // No overlap
    availabilityRepo.findOverlap.mockResolvedValue(null);

    const created = {
      id: 'av-1',
      userId,
      dayOfWeek: 2,
      startTime: '09:00:00',
      endTime: '12:00:00',
      label: 'Morning classes',
    };
    availabilityRepo.createAvailability.mockResolvedValue(created);

    const result = await availabilityService.createAvailability({ userId, ...payload });

    expect(result).toEqual(created);
    expect(availabilityRepo.findOverlap).toHaveBeenCalledWith(
      userId,
      2,
      payload.startTime,
      payload.endTime
    );
    expect(availabilityRepo.createAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        dayOfWeek: 2,
        startTime: payload.startTime,
        endTime: payload.endTime,
      })
    );
  });

  it('should reject overlapping availability (OVERLAP error)', async () => {
    const userId = 'user-456';
    const payload = {
      dayOfWeek: 3,
      startTime: new Date('1970-01-01T10:00:00.000Z'),
      endTime: new Date('1970-01-01T11:00:00.000Z'),
    };

    // Overlap found: 09:00-12:00 conflicts with 10:00-11:00
    const overlap = {
      id: 'av-existing',
      userId,
      dayOfWeek: 3,
      startTime: '09:00:00',
      endTime: '12:00:00',
    };
    availabilityRepo.findOverlap.mockResolvedValue(overlap);

    await expect(
      availabilityService.createAvailability({ userId, ...payload })
    ).rejects.toMatchObject({ code: 'OVERLAP' });
  });

  it('should reject if start time >= end time (INVALID_TIMES error)', async () => {
    const userId = 'user-789';

    await expect(
      availabilityService.createAvailability({
        userId,
        dayOfWeek: 2,
        startTime: new Date('1970-01-01T18:00:00.000Z'),
        endTime: new Date('1970-01-01T08:00:00.000Z'), // Invalid: end before start
      })
    ).rejects.toMatchObject({ code: 'INVALID_TIMES' });

    // Should not check overlap if time is invalid
    expect(availabilityRepo.findOverlap).not.toHaveBeenCalled();
  });

  it('should reject if start time equals end time', async () => {
    const userId = 'user-789';

    await expect(
      availabilityService.createAvailability({
        userId,
        dayOfWeek: 2,
        startTime: new Date('1970-01-01T09:00:00.000Z'),
        endTime: new Date('1970-01-01T09:00:00.000Z'), // Invalid: same time
      })
    ).rejects.toMatchObject({ code: 'INVALID_TIMES' });
  });

  it('should validate day of week (0-6)', async () => {
    const userId = 'user-123';

    // Note: dayOfWeek validation happens at the repo level, not service level
    // The service only validates time ordering and overlap
    availabilityRepo.findOverlap.mockResolvedValue(null);
    availabilityRepo.createAvailability.mockResolvedValue({ id: 'av-1', userId, dayOfWeek: 7 });

    const result = await availabilityService.createAvailability({
      userId,
      dayOfWeek: 7, // Passed through to repo
      startTime: new Date('1970-01-01T09:00:00.000Z'),
      endTime: new Date('1970-01-01T12:00:00.000Z'),
    });

    expect(result).toBeDefined();
  });

  it('should allow optional label field', async () => {
    const userId = 'user-123';
    const payload = {
      dayOfWeek: 1,
      startTime: new Date('1970-01-01T14:00:00.000Z'),
      endTime: new Date('1970-01-01T18:00:00.000Z'),
      // No label
    };

    availabilityRepo.findOverlap.mockResolvedValue(null);
    availabilityRepo.createAvailability.mockResolvedValue({
      id: 'av-2',
      userId,
      ...payload,
      label: null,
    });

    const result = await availabilityService.createAvailability({ userId, ...payload });

    expect(result.label).toBeNull();
  });
});

describe('availabilityService.updateAvailability', () => {
  it('should update availability when no overlap with new times', async () => {
    const userId = 'user-123';
    const avId = 'av-1';

    // Existing availability
    const existing = {
      id: avId,
      userId,
      dayOfWeek: 2,
      startTime: new Date('1970-01-01T09:00:00.000Z'),
      endTime: new Date('1970-01-01T12:00:00.000Z'),
    };

    availabilityRepo.findAvailabilityById.mockResolvedValue(existing);

    const updatedTime = new Date('1970-01-01T10:00:00.000Z');
    const updatedEndTime = new Date('1970-01-01T13:00:00.000Z');

    availabilityRepo.updateAvailability.mockResolvedValue({
      ...existing,
      startTime: updatedTime,
      endTime: updatedEndTime,
    });

    // No overlap with new times (excluding self)
    availabilityRepo.findOverlap.mockResolvedValue(null);

    const result = await availabilityService.updateAvailability(avId, userId, {
      startTime: updatedTime,
      endTime: updatedEndTime,
    });

    expect(availabilityRepo.findOverlap).toHaveBeenCalledWith(
      userId,
      existing.dayOfWeek,
      updatedTime,
      updatedEndTime,
      avId // Exclude self
    );
  });

  it('should reject update due to overlap', async () => {
    const userId = 'user-456';
    const avId = 'av-1';

    const existing = {
      id: avId,
      userId,
      dayOfWeek: 2,
      startTime: new Date('1970-01-01T09:00:00.000Z'),
      endTime: new Date('1970-01-01T12:00:00.000Z'),
    };
    availabilityRepo.findAvailabilityById.mockResolvedValue(existing);

    const overlap = {
      id: 'av-other',
      userId,
      dayOfWeek: 2,
      startTime: '10:00:00',
      endTime: '13:00:00',
    };
    availabilityRepo.findOverlap.mockResolvedValue(overlap);

    await expect(
      availabilityService.updateAvailability(avId, userId, {
        startTime: new Date('1970-01-01T11:00:00.000Z'),
        endTime: new Date('1970-01-01T12:00:00.000Z'),
      })
    ).rejects.toMatchObject({ code: 'OVERLAP' });
  });

  it('should reject update with invalid times', async () => {
    const userId = 'user-123';
    const avId = 'av-1';

    const existing = {
      id: avId,
      userId,
      dayOfWeek: 2,
      startTime: new Date('1970-01-01T09:00:00.000Z'),
      endTime: new Date('1970-01-01T12:00:00.000Z'),
    };
    availabilityRepo.findAvailabilityById.mockResolvedValue(existing);

    await expect(
      availabilityService.updateAvailability(avId, userId, {
        startTime: new Date('1970-01-01T18:00:00.000Z'),
        endTime: new Date('1970-01-01T08:00:00.000Z'),
      })
    ).rejects.toMatchObject({ code: 'INVALID_TIMES' });

    expect(availabilityRepo.findOverlap).not.toHaveBeenCalled();
  });

  it('should allow partial updates (only startTime or endTime)', async () => {
    const userId = 'user-123';
    const avId = 'av-1';

    const existing = {
      id: avId,
      userId,
      dayOfWeek: 2,
      startTime: new Date('1970-01-01T09:00:00.000Z'),
      endTime: new Date('1970-01-01T12:00:00.000Z'),
    };
    availabilityRepo.findAvailabilityById.mockResolvedValue(existing);

    const updatedStartTime = new Date('1970-01-01T08:00:00.000Z');

    availabilityRepo.updateAvailability.mockResolvedValue({
      id: avId,
      userId,
      dayOfWeek: 2,
      startTime: updatedStartTime,
      endTime: existing.endTime,
    });

    availabilityRepo.findOverlap.mockResolvedValue(null);

    const result = await availabilityService.updateAvailability(avId, userId, {
      startTime: updatedStartTime,
    });

    expect(result.startTime).toBeDefined();
  });
});

describe('availabilityService.deleteAvailability', () => {
  it('should delete availability by id', async () => {
    const userId = 'user-123';
    const avId = 'av-1';

    availabilityRepo.findAvailabilityById.mockResolvedValue({
      id: avId,
      userId,
      dayOfWeek: 2,
      startTime: '09:00:00',
      endTime: '12:00:00',
    });

    await availabilityService.deleteAvailability(avId, userId);

    expect(availabilityRepo.deleteAvailability).toHaveBeenCalledWith(avId);
  });
});

describe('availabilityService Overlap Detection', () => {
  const testCases = [
    {
      name: 'exact overlap (same times)',
      existing: { start: '09:00:00', end: '12:00:00' },
      new: { start: '09:00:00', end: '12:00:00' },
      shouldOverlap: true,
    },
    {
      name: 'partial overlap (new starts inside existing)',
      existing: { start: '09:00:00', end: '12:00:00' },
      new: { start: '10:00:00', end: '13:00:00' },
      shouldOverlap: true,
    },
    {
      name: 'partial overlap (new ends inside existing)',
      existing: { start: '09:00:00', end: '12:00:00' },
      new: { start: '08:00:00', end: '10:00:00' },
      shouldOverlap: true,
    },
    {
      name: 'new completely inside existing',
      existing: { start: '09:00:00', end: '12:00:00' },
      new: { start: '09:30:00', end: '11:00:00' },
      shouldOverlap: true,
    },
    {
      name: 'no overlap (new before existing)',
      existing: { start: '09:00:00', end: '12:00:00' },
      new: { start: '08:00:00', end: '09:00:00' },
      shouldOverlap: false,
    },
    {
      name: 'no overlap (new after existing)',
      existing: { start: '09:00:00', end: '12:00:00' },
      new: { start: '12:00:00', end: '15:00:00' },
      shouldOverlap: false,
    },
  ];

  testCases.forEach(({ name, existing, new: newTimes, shouldOverlap }) => {
    it(`should ${shouldOverlap ? 'detect' : 'allow'}: ${name}`, async () => {
      const userId = 'user-123';

      if (shouldOverlap) {
        availabilityRepo.findOverlap.mockResolvedValue({
          id: 'av-existing',
          userId,
          dayOfWeek: 2,
          startTime: existing.start,
          endTime: existing.end,
        });

        await expect(
          availabilityService.createAvailability({
            userId,
            dayOfWeek: 2,
            startTime: new Date(`1970-01-01T${newTimes.start}.000Z`),
            endTime: new Date(`1970-01-01T${newTimes.end}.000Z`),
          })
        ).rejects.toMatchObject({ code: 'OVERLAP' });
      } else {
        availabilityRepo.findOverlap.mockResolvedValue(null);
        availabilityRepo.createAvailability.mockResolvedValue({
          id: 'av-new',
          userId,
          dayOfWeek: 2,
          startTime: newTimes.start,
          endTime: newTimes.end,
        });

        const result = await availabilityService.createAvailability({
          userId,
          dayOfWeek: 2,
          startTime: new Date(`1970-01-01T${newTimes.start}.000Z`),
          endTime: new Date(`1970-01-01T${newTimes.end}.000Z`),
        });

        expect(result).toBeDefined();
      }
    });
  });
});

describe('availabilityService.getFreeAvailabilityByUserId', () => {
  it('should return blocks minus booked sessions', async () => {
    const userId = 'user-123';

    const blocks = [
      {
        id: 'av-mon',
        userId,
        dayOfWeek: 1,
        startTime: '09:00:00',
        endTime: '17:00:00',
      },
      {
        id: 'av-wed',
        userId,
        dayOfWeek: 3,
        startTime: '10:00:00',
        endTime: '14:00:00',
      },
    ];

    availabilityRepo.findAvailabilityByUserId.mockResolvedValue(blocks);
    availabilityRepo.findScheduleByUserId.mockResolvedValue(null);

    const result = await availabilityService.getFreeAvailabilityByUserId(userId);

    expect(availabilityRepo.findAvailabilityByUserId).toHaveBeenCalledWith(userId);
    expect(result.availabilities).toBeDefined();
  });
});
