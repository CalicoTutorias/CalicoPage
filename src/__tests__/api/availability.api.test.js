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

jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
}));

const prisma = require('@/lib/prisma').default;
const { authenticateRequest } = require('@/lib/auth/middleware');

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
    authenticateRequest.mockReturnValue({ sub: userId });

    const payload = {
      dayOfWeek: 2, // Tuesday
      startTime: '08:00:00',
      endTime: '12:00:00',
      isRecurring: true,
    };

    const created = {
      id: 'av-1',
      userId,
      ...payload,
    };

    prisma.availability.create.mockResolvedValue(created);

    const request = buildRequest('POST', payload);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.availability.dayOfWeek).toBe(2);
    expect(prisma.availability.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId,
          dayOfWeek: 2,
          startTime: '08:00:00',
          endTime: '12:00:00',
        }),
      })
    );
  });

  it('should create multiple availabilities when adding bulk slots', async () => {
    const userId = 'user-456';
    authenticateRequest.mockReturnValue({ sub: userId });

    const slots = [
      { dayOfWeek: 1, startTime: '09:00:00', endTime: '13:00:00' },
      { dayOfWeek: 3, startTime: '14:00:00', endTime: '18:00:00' },
    ];

    prisma.availability.create.mockResolvedValueOnce({ id: 'av-1', ...slots[0], userId });
    prisma.availability.create.mockResolvedValueOnce({ id: 'av-2', ...slots[1], userId });

    // Assuming the API handles bulk operations
    const results = [];
    for (const slot of slots) {
      const request = buildRequest('POST', { ...slot, isRecurring: true });
      const response = await POST(request);
      const data = await response.json();
      results.push(data);
    }

    expect(results).toHaveLength(2);
    expect(prisma.availability.create).toHaveBeenCalledTimes(2);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Validation
  // ─────────────────────────────────────────────────────────────────────

  it('should reject invalid day of week', async () => {
    authenticateRequest.mockReturnValue({ sub: 'user-123' });

    const request = buildRequest('POST', {
      dayOfWeek: 7, // Invalid (0-6 only)
      startTime: '08:00:00',
      endTime: '12:00:00',
      isRecurring: true,
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('should reject end time before start time', async () => {
    authenticateRequest.mockReturnValue({ sub: 'user-123' });

    const request = buildRequest('POST', {
      dayOfWeek: 2,
      startTime: '18:00:00',
      endTime: '08:00:00', // Invalid: end before start
      isRecurring: true,
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('end time');
  });

  it('should reject overlapping availability slots', async () => {
    const userId = 'user-123';
    authenticateRequest.mockReturnValue({ sub: userId });

    // Mock existing availability
    prisma.availability.findMany.mockResolvedValue([
      {
        id: 'av-existing',
        userId,
        dayOfWeek: 2,
        startTime: '09:00:00',
        endTime: '12:00:00',
      },
    ]);

    // Try to create overlapping slot
    const request = buildRequest('POST', {
      dayOfWeek: 2,
      startTime: '10:00:00', // Overlaps with 09:00-12:00
      endTime: '11:00:00',
      isRecurring: true,
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.success).toBe(false);
    expect(data.error).toContain('overlap');
  });

  it('should reject invalid time format', async () => {
    authenticateRequest.mockReturnValue({ sub: 'user-123' });

    const request = buildRequest('POST', {
      dayOfWeek: 2,
      startTime: '8:00', // Invalid: should be HH:MM:SS
      endTime: '12:00:00',
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
    const errorResponse = new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
    });
    authenticateRequest.mockReturnValue(errorResponse);

    const request = buildRequest('POST', {
      dayOfWeek: 2,
      startTime: '08:00:00',
      endTime: '12:00:00',
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
    authenticateRequest.mockReturnValue({ sub: userId });

    prisma.availability.findUnique.mockResolvedValue({
      id: avId,
      userId,
      dayOfWeek: 2,
      startTime: '08:00:00',
      endTime: '12:00:00',
    });

    const updated = {
      id: avId,
      userId,
      dayOfWeek: 2,
      startTime: '09:00:00', // Changed
      endTime: '13:00:00', // Changed
    };

    prisma.availability.update.mockResolvedValue(updated);

    const request = buildRequest('PUT', {
      startTime: '09:00:00',
      endTime: '13:00:00',
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
    authenticateRequest.mockReturnValue({ sub: userId });

    prisma.availability.findUnique.mockResolvedValue(null);

    const request = buildRequest('PUT', {
      startTime: '09:00:00',
      endTime: '13:00:00',
    });
    const response = await PUT(request, { params: Promise.resolve({ id: avId }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
  });

  it('should prevent access to other users availability', async () => {
    const userId = 'user-123';
    const avId = 'av-1';
    authenticateRequest.mockReturnValue({ sub: userId });

    // Availability belongs to different user
    prisma.availability.findUnique.mockResolvedValue({
      id: avId,
      userId: 'different-user',
      dayOfWeek: 2,
      startTime: '08:00:00',
      endTime: '12:00:00',
    });

    const request = buildRequest('PUT', {
      startTime: '09:00:00',
      endTime: '13:00:00',
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
    authenticateRequest.mockReturnValue({ sub: userId });

    prisma.availability.findUnique.mockResolvedValue({
      id: avId,
      userId,
      dayOfWeek: 2,
      startTime: '08:00:00',
      endTime: '12:00:00',
    });

    prisma.availability.delete.mockResolvedValue({ id: avId });

    const request = new Request('http://localhost/api/availabilities/av-1', {
      method: 'DELETE',
    });
    const route = require('@/app/api/availabilities/[id]/route');
    const response = await route.DELETE(request, { params: Promise.resolve({ id: avId }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(prisma.availability.delete).toHaveBeenCalledWith({
      where: { id: avId },
    });
  });
});
