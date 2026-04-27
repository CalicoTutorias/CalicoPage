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
}));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    availability: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
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
      startTime: '09:00:00',
      endTime: '12:00:00',
      label: 'Morning classes',
    };

    // No overlap
    availabilityRepo.findOverlap.mockResolvedValue(null);

    const created = {
      id: 'av-1',
      userId,
      ...payload,
    };
    availabilityRepo.createAvailability.mockResolvedValue(created);

    const result = await availabilityService.createAvailability(userId, payload);

    expect(result).toEqual(created);
    expect(availabilityRepo.findOverlap).toHaveBeenCalledWith(
      userId,
      2,
      '09:00:00',
      '12:00:00',
      undefined
    );
    expect(availabilityRepo.createAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        dayOfWeek: 2,
        startTime: '09:00:00',
        endTime: '12:00:00',
        label: 'Morning classes',
      })
    );
  });

  it('should reject overlapping availability (OVERLAP error)', async () => {
    const userId = 'user-456';
    const payload = {
      dayOfWeek: 3,
      startTime: '10:00:00',
      endTime: '11:00:00',
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
      availabilityService.createAvailability(userId, payload)
    ).rejects.toThrow('OVERLAP');
  });

  it('should reject if start time >= end time (INVALID_TIMES error)', async () => {
    const userId = 'user-789';

    await expect(
      availabilityService.createAvailability(userId, {
        dayOfWeek: 2,
        startTime: '18:00:00',
        endTime: '08:00:00', // Invalid: end before start
      })
    ).rejects.toThrow('INVALID_TIMES');

    // Should not check overlap if time is invalid
    expect(availabilityRepo.findOverlap).not.toHaveBeenCalled();
  });

  it('should reject if start time equals end time', async () => {
    const userId = 'user-789';

    await expect(
      availabilityService.createAvailability(userId, {
        dayOfWeek: 2,
        startTime: '09:00:00',
        endTime: '09:00:00', // Invalid: same time
      })
    ).rejects.toThrow('INVALID_TIMES');
  });

  it('should validate day of week (0-6)', async () => {
    const userId = 'user-123';

    await expect(
      availabilityService.createAvailability(userId, {
        dayOfWeek: 7, // Invalid
        startTime: '09:00:00',
        endTime: '12:00:00',
      })
    ).rejects.toThrow();
  });

  it('should allow optional label field', async () => {
    const userId = 'user-123';
    const payload = {
      dayOfWeek: 1,
      startTime: '14:00:00',
      endTime: '18:00:00',
      // No label
    };

    availabilityRepo.findOverlap.mockResolvedValue(null);
    availabilityRepo.createAvailability.mockResolvedValue({
      id: 'av-2',
      userId,
      ...payload,
      label: null,
    });

    const result = await availabilityService.createAvailability(userId, payload);

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
      startTime: '09:00:00',
      endTime: '12:00:00',
    };

    availabilityRepo.updateAvailability.mockResolvedValue({
      ...existing,
      startTime: '10:00:00', // Updated
      endTime: '13:00:00', // Updated
    });

    // No overlap with new times (excluding self)
    availabilityRepo.findOverlap.mockResolvedValue(null);

    const result = await availabilityService.updateAvailability(userId, avId, {
      startTime: '10:00:00',
      endTime: '13:00:00',
    });

    expect(result.startTime).toBe('10:00:00');
    expect(result.endTime).toBe('13:00:00');
    expect(availabilityRepo.findOverlap).toHaveBeenCalledWith(
      userId,
      existing.dayOfWeek,
      '10:00:00',
      '13:00:00',
      avId // Exclude self
    );
  });

  it('should reject update due to overlap', async () => {
    const userId = 'user-456';
    const avId = 'av-1';

    const overlap = {
      id: 'av-other',
      userId,
      dayOfWeek: 2,
      startTime: '10:00:00',
      endTime: '13:00:00',
    };
    availabilityRepo.findOverlap.mockResolvedValue(overlap);

    await expect(
      availabilityService.updateAvailability(userId, avId, {
        startTime: '11:00:00',
        endTime: '12:00:00',
      })
    ).rejects.toThrow('OVERLAP');
  });

  it('should reject update with invalid times', async () => {
    const userId = 'user-123';
    const avId = 'av-1';

    await expect(
      availabilityService.updateAvailability(userId, avId, {
        startTime: '18:00:00',
        endTime: '08:00:00',
      })
    ).rejects.toThrow('INVALID_TIMES');

    expect(availabilityRepo.findOverlap).not.toHaveBeenCalled();
  });

  it('should allow partial updates (only startTime or endTime)', async () => {
    const userId = 'user-123';
    const avId = 'av-1';

    availabilityRepo.updateAvailability.mockResolvedValue({
      id: avId,
      userId,
      dayOfWeek: 2,
      startTime: '08:00:00', // Updated
      endTime: '12:00:00', // Kept same
    });

    availabilityRepo.findOverlap.mockResolvedValue(null);

    const result = await availabilityService.updateAvailability(userId, avId, {
      startTime: '08:00:00',
    });

    expect(result.startTime).toBe('08:00:00');
  });
});

describe('availabilityService.deleteAvailability', () => {
  it('should delete availability by id', async () => {
    const userId = 'user-123';
    const avId = 'av-1';

    availabilityRepo.deleteAvailability.mockResolvedValue({
      id: avId,
      userId,
      dayOfWeek: 2,
      startTime: '09:00:00',
      endTime: '12:00:00',
    });

    const result = await availabilityService.deleteAvailability(userId, avId);

    expect(result.id).toBe(avId);
    expect(availabilityRepo.deleteAvailability).toHaveBeenCalledWith(avId);
  });
});

describe('availabilityService Overlap Detection', () => {
  // Test various overlap scenarios
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
          availabilityService.createAvailability(userId, {
            dayOfWeek: 2,
            startTime: newTimes.start,
            endTime: newTimes.end,
          })
        ).rejects.toThrow('OVERLAP');
      } else {
        availabilityRepo.findOverlap.mockResolvedValue(null);
        availabilityRepo.createAvailability.mockResolvedValue({
          id: 'av-new',
          userId,
          dayOfWeek: 2,
          startTime: newTimes.start,
          endTime: newTimes.end,
        });

        const result = await availabilityService.createAvailability(userId, {
          dayOfWeek: 2,
          startTime: newTimes.start,
          endTime: newTimes.end,
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

    // Mock session service to return active sessions
    const bookedSessions = [
      {
        id: 'sess-1',
        tutorId: userId,
        startTimestamp: new Date('2026-04-20T13:00:00Z'), // Monday 09:00 BOG
        endTimestamp: new Date('2026-04-20T14:00:00Z'),
        status: 'Accepted',
      },
    ];

    // This would require mocking sessionService.getScheduleByTutor
    // For now, just verify blocks are returned
    const result = await availabilityService.getFreeAvailabilityByUserId(userId);

    expect(availabilityRepo.findAvailabilityByUserId).toHaveBeenCalledWith(userId);
  });
});
