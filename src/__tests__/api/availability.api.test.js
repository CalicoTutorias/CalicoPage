/**
 * @jest-environment node
 *
 * Integration tests for availability API endpoints
 * Tests: POST /api/availabilities (create), PUT /api/availabilities/:id (update)
 * Verifies conflict detection, validation, and state management
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    availability: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    session: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/repositories/availability.repository', () => ({
  findAvailabilityByUserId: jest.fn(),
  findOverlap: jest.fn(),
  createAvailability: jest.fn(),
  updateAvailability: jest.fn(),
  deleteAvailability: jest.fn(),
  findAvailabilityById: jest.fn(),
  findScheduleByUserId: jest.fn(),
}));

const { NextResponse } = require('next/server');

jest.mock('@/lib/auth/guards', () => {
  const { NextResponse } = require('next/server');
  return {
    authenticateRequest: jest.fn(),
    requireTutor: jest.fn(),
  };
});

const prisma = require('@/lib/prisma').default;
const { requireTutor } = require('@/lib/auth/guards');
const availabilityRepo = require('@/lib/repositories/availability.repository');

describe('POST /api/availabilities (Create Availability)', () => {
  let POST;

  beforeAll(() => {
    const route = require('@/app/api/availabilities/route');
    POST = route.POST;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildRequest(method, body) {
    return new Request('http://localhost/api/availabilities', {
      method,
      body: JSON.stringify(body),
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Happy Path
  // ─────────────────────────────────────────────────────────────────────

  it('should create availability for single day', async () => {
    const userId = 'user-123';
    requireTutor.mockReturnValue({ sub: userId });

    const payload = {
      dayOfWeek: 2, // Tuesday
      startTime: '08:00',
      endTime: '12:00',
      isRecurring: true,
    };

    const created = {
      id: 'av-1',
      userId,
      ...payload,
    };

    availabilityRepo.createAvailability.mockResolvedValue(created);
    availabilityRepo.findOverlap.mockResolvedValue(null);

    const request = buildRequest('POST', payload);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.availability.dayOfWeek).toBe(2);
  });

  it('should create multiple availabilities when adding bulk slots', async () => {
    const userId = 'user-456';
    requireTutor.mockReturnValue({ sub: userId });

    const slots = [
      { dayOfWeek: 1, startTime: '09:00', endTime: '13:00' },
      { dayOfWeek: 3, startTime: '14:00', endTime: '18:00' },
    ];

    availabilityRepo.findOverlap.mockResolvedValue(null);
    availabilityRepo.createAvailability.mockResolvedValueOnce({ id: 'av-1', userId, ...slots[0] });
    availabilityRepo.createAvailability.mockResolvedValueOnce({ id: 'av-2', userId, ...slots[1] });

    const results = [];
    for (const slot of slots) {
      const request = buildRequest('POST', { ...slot, isRecurring: true });
      const response = await POST(request);
      const data = await response.json();
      results.push(data);
    }

    expect(results).toHaveLength(2);
    expect(availabilityRepo.createAvailability).toHaveBeenCalledTimes(2);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Validation
  // ─────────────────────────────────────────────────────────────────────

  it('should reject invalid day of week', async () => {
    requireTutor.mockReturnValue({ sub: 'user-123' });

    const request = buildRequest('POST', {
      dayOfWeek: 7, // Invalid (0-6 only)
      startTime: '08:00',
      endTime: '12:00',
      isRecurring: true,
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('should reject end time before start time', async () => {
    requireTutor.mockReturnValue({ sub: 'user-123' });

    const request = buildRequest('POST', {
      dayOfWeek: 2,
      startTime: '18:00',
      endTime: '08:00', // Invalid: end before start
      isRecurring: true,
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('should reject overlapping availability slots', async () => {
    const userId = 'user-123';
    requireTutor.mockReturnValue({ sub: userId });

    // Mock existing availability overlap
    availabilityRepo.findOverlap.mockResolvedValue({
      id: 'av-existing',
      userId,
      dayOfWeek: 2,
      startTime: '09:00:00',
      endTime: '12:00:00',
    });

    // Try to create overlapping slot
    const request = buildRequest('POST', {
      dayOfWeek: 2,
      startTime: '10:00', // Overlaps with 09:00-12:00
      endTime: '11:00',
      isRecurring: true,
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.success).toBe(false);
    expect(data.error).toContain('cruza');
  });

  it('should reject invalid time format', async () => {
    requireTutor.mockReturnValue({ sub: 'user-123' });

    const request = buildRequest('POST', {
      dayOfWeek: 2,
      startTime: '8:00', // Invalid: should be HH:MM
      endTime: '12:00',
      isRecurring: true,
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Authentication
  // ─────────────────────────────────────────────────────────────────────

  it('should return 401 if not authenticated', async () => {
    requireTutor.mockReturnValue(
      NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 })
    );

    const request = buildRequest('POST', {
      dayOfWeek: 2,
      startTime: '08:00',
      endTime: '12:00',
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// PUT /api/availabilities/:id (Update Availability)
// ─────────────────────────────────────────────────────────────────────────

describe('PUT /api/availabilities/:id (Update Availability)', () => {
  let PUT;

  beforeAll(() => {
    const route = require('@/app/api/availabilities/[id]/route');
    PUT = route.PUT;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildRequest(method, body) {
    return new Request('http://localhost/api/availabilities/av-1', {
      method,
      body: JSON.stringify(body),
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Happy Path
  // ─────────────────────────────────────────────────────────────────────

  it('should successfully update availability slot', async () => {
    const userId = 'user-123';
    const avId = 'av-1';
    requireTutor.mockReturnValue({ sub: userId });

    const existing = {
      id: avId,
      userId,
      dayOfWeek: 2,
      startTime: '08:00:00',
      endTime: '12:00:00',
    };
    availabilityRepo.findAvailabilityById.mockResolvedValue(existing);
    availabilityRepo.findOverlap.mockResolvedValue(null);

    const updated = {
      id: avId,
      userId,
      dayOfWeek: 2,
      startTime: '09:00:00', // Changed
      endTime: '13:00:00', // Changed
    };
    availabilityRepo.updateAvailability.mockResolvedValue(updated);

    const request = buildRequest('PUT', {
      startTime: '09:00',
      endTime: '13:00',
    });
    const response = await PUT(request, { params: Promise.resolve({ id: avId }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.availability.startTime).toBe('09:00:00');
  });

  it('should return 404 if availability not found', async () => {
    const userId = 'user-123';
    const avId = 'nonexistent-av';
    requireTutor.mockReturnValue({ sub: userId });

    availabilityRepo.findAvailabilityById.mockResolvedValue(null);

    const request = buildRequest('PUT', {
      startTime: '09:00',
      endTime: '13:00',
    });
    const response = await PUT(request, { params: Promise.resolve({ id: avId }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
  });

  it('should prevent access to other users availability', async () => {
    const userId = 'user-123';
    const avId = 'av-1';
    requireTutor.mockReturnValue({ sub: userId });

    // Availability belongs to different user
    availabilityRepo.findAvailabilityById.mockResolvedValue({
      id: avId,
      userId: 'different-user',
      dayOfWeek: 2,
      startTime: '08:00:00',
      endTime: '12:00:00',
    });

    const request = buildRequest('PUT', {
      startTime: '09:00',
      endTime: '13:00',
    });
    const response = await PUT(request, { params: Promise.resolve({ id: avId }) });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.success).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Delete Availability
  // ─────────────────────────────────────────────────────────────────────

  it('should successfully delete availability', async () => {
    const userId = 'user-123';
    const avId = 'av-1';
    requireTutor.mockReturnValue({ sub: userId });

    availabilityRepo.findAvailabilityById.mockResolvedValue({
      id: avId,
      userId,
      dayOfWeek: 2,
      startTime: '08:00:00',
      endTime: '12:00:00',
    });

    const route = require('@/app/api/availabilities/[id]/route');
    const response = await route.DELETE(
      new Request('http://localhost/api/availabilities/av-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: avId }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(availabilityRepo.deleteAvailability).toHaveBeenCalledWith(avId);
  });
});
