/**
 * @jest-environment node
 *
 * Integration tests for tutor courses API endpoints
 * Tests: GET /api/tutor/courses, POST /api/tutor/courses, DELETE /api/tutor/courses/:courseId
 * Verifies course request workflow, status filtering, and permission checks
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    tutorCourse: {
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
    tutorProfile: {
      upsert: jest.fn(),
    },
    course: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const { NextResponse } = require('next/server');

jest.mock('@/lib/auth/guards', () => {
  const { NextResponse } = require('next/server');
  return {
    authenticateRequest: jest.fn(),
    requireTutor: jest.fn(),
  };
});

jest.mock('@/lib/services/email.service', () => ({
  sendCourseRequestNotification: jest.fn(),
}));

const prisma = require('@/lib/prisma').default;
const { authenticateRequest, requireTutor } = require('@/lib/auth/guards');
const emailService = require('@/lib/services/email.service');

describe('GET /api/tutor/courses', () => {
  let GET;

  beforeAll(() => {
    const route = require('@/app/api/tutor/courses/route');
    GET = route.GET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildRequest(query = '') {
    return new Request(`http://localhost/api/tutor/courses${query}`);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Happy Path
  // ─────────────────────────────────────────────────────────────────────

  it('should return all tutor courses', async () => {
    const tutorId = 'user-123';
    authenticateRequest.mockReturnValue({ sub: tutorId });
    requireTutor.mockReturnValue({ sub: tutorId });

    const mockCourses = [
      {
        tutorId,
        courseId: 'course-1',
        status: 'Approved',
        experience: '5 years',
        workSampleUrl: 'https://example.com',
        course: {
          id: 'course-1',
          name: 'Cálculo I',
          code: 'CALC101',
          basePrice: 50000,
          coursePrice: { price: 55000 },
        },
      },
      {
        tutorId,
        courseId: 'course-2',
        status: 'Pending',
        experience: '3 years',
        workSampleUrl: null,
        course: {
          id: 'course-2',
          name: 'Álgebra',
          code: 'ALG101',
          basePrice: 50000,
          coursePrice: null,
        },
      },
    ];

    prisma.tutorCourse.findMany.mockResolvedValue(mockCourses);

    const request = buildRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.courses).toHaveLength(2);
    expect(data.courses[0].status).toBe('Approved');
    expect(data.courses[1].status).toBe('Pending');
  });

  it('should filter courses by status', async () => {
    const tutorId = 'user-456';
    authenticateRequest.mockReturnValue({ sub: tutorId });
    requireTutor.mockReturnValue({ sub: tutorId });

    const approvedCourses = [
      {
        tutorId,
        courseId: 'course-1',
        status: 'Approved',
        course: { id: 'course-1', name: 'Cálculo I', basePrice: 50000 },
      },
    ];

    prisma.tutorCourse.findMany.mockResolvedValue(approvedCourses);

    const request = buildRequest('?status=Approved');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.courses).toHaveLength(1);
    expect(data.courses[0].status).toBe('Approved');
    expect(prisma.tutorCourse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'Approved',
        }),
      })
    );
  });

  it('should include course pricing from coursePrice or basePrice', async () => {
    const tutorId = 'user-789';
    authenticateRequest.mockReturnValue({ sub: tutorId });
    requireTutor.mockReturnValue({ sub: tutorId });

    const mockCourses = [
      {
        tutorId,
        courseId: 'course-1',
        status: 'Approved',
        course: {
          name: 'Cálculo I',
          basePrice: 50000,
          coursePrice: { price: 55000 }, // Custom price takes precedence
        },
      },
      {
        tutorId,
        courseId: 'course-2',
        status: 'Approved',
        course: {
          name: 'Álgebra',
          basePrice: 45000,
          coursePrice: null, // Falls back to basePrice
        },
      },
    ];

    prisma.tutorCourse.findMany.mockResolvedValue(mockCourses);

    const request = buildRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(data.courses[0].course.coursePrice.price).toBe(55000);
    expect(data.courses[1].course.basePrice).toBe(45000);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Authentication & Authorization
  // ─────────────────────────────────────────────────────────────────────

  it('should return 401 if not authenticated', async () => {
    requireTutor.mockReturnValue(
      NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 })
    );

    const request = buildRequest();
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should return 403 if user is not a tutor', async () => {
    authenticateRequest.mockReturnValue({ sub: 'user-123' });
    requireTutor.mockReturnValue(
      NextResponse.json({ success: false, error: 'TUTOR_NOT_APPROVED' }, { status: 403 })
    );

    const request = buildRequest();
    const response = await GET(request);

    expect(response.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// POST /api/tutor/courses (Request new courses)
// ─────────────────────────────────────────────────────────────────────────

describe('POST /api/tutor/courses', () => {
  let POST;

  beforeAll(() => {
    const route = require('@/app/api/tutor/courses/route');
    POST = route.POST;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildRequest(method, body) {
    return new Request('http://localhost/api/tutor/courses', {
      method,
      body: JSON.stringify(body),
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Happy Path
  // ─────────────────────────────────────────────────────────────────────

  it('should successfully request approval for new courses', async () => {
    const tutorId = 'user-123';
    authenticateRequest.mockReturnValue({ sub: tutorId });
    requireTutor.mockReturnValue({ sub: tutorId });

    const tutor = {
      id: tutorId,
      email: 'tutor@example.com',
      name: 'John Doe',
      isTutorApproved: true,
    };

    prisma.user.findUnique.mockResolvedValue(tutor);

    prisma.course.findMany.mockResolvedValue([
      { id: '550e8400-e29b-41d4-a716-446655440001' },
    ]);

    // No existing tutor courses
    prisma.tutorCourse.findMany.mockResolvedValue([]);

    prisma.tutorProfile.upsert.mockResolvedValue({});

    const createdCourses = [
      {
        tutorId,
        courseId: '550e8400-e29b-41d4-a716-446655440001',
        status: 'Pending',
        experience: '5 years teaching calculus',
        workSampleUrl: 'https://example.com/samples/calc.pdf',
        course: { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Cálculo I' },
      },
    ];

    prisma.$transaction.mockResolvedValue(createdCourses);
    emailService.sendCourseRequestNotification.mockResolvedValue({ success: true });

    const request = buildRequest('POST', {
      courses: [
        {
          courseId: '550e8400-e29b-41d4-a716-446655440001',
          experience: '5 years teaching calculus',
          workSampleUrl: 'https://example.com/samples/calc.pdf',
        },
      ],
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.courses).toHaveLength(1);
    expect(data.courses[0].status).toBe('Pending');
    expect(emailService.sendCourseRequestNotification).toHaveBeenCalled();
  });

  it('should validate that course exists', async () => {
    const tutorId = 'user-123';
    authenticateRequest.mockReturnValue({ sub: tutorId });
    requireTutor.mockReturnValue({ sub: tutorId });

    prisma.user.findUnique.mockResolvedValue({
      id: tutorId,
      isTutorApproved: true,
    });

    // Course not found
    prisma.course.findMany.mockResolvedValue([]);

    const request = buildRequest('POST', {
      courses: [
        {
          courseId: '550e8400-e29b-41d4-a716-446655440002',
          experience: '5 years',
          workSampleUrl: 'https://example.com',
        },
      ],
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toContain('not found');
  });

  // ─────────────────────────────────────────────────────────────────────
  // Business Logic - Duplicate Prevention
  // ─────────────────────────────────────────────────────────────────────

  it('should reject duplicate course request (COURSE_ALREADY_ADDED)', async () => {
    const tutorId = 'user-123';
    authenticateRequest.mockReturnValue({ sub: tutorId });
    requireTutor.mockReturnValue({ sub: tutorId });

    prisma.user.findUnique.mockResolvedValue({
      id: tutorId,
      isTutorApproved: true,
    });

    prisma.course.findMany.mockResolvedValue([
      { id: '550e8400-e29b-41d4-a716-446655440003' },
    ]);

    // Course already exists for this tutor (regardless of status)
    prisma.tutorCourse.findMany.mockResolvedValue([
      { courseId: '550e8400-e29b-41d4-a716-446655440003' },
    ]);

    const request = buildRequest('POST', {
      courses: [
        {
          courseId: '550e8400-e29b-41d4-a716-446655440003',
          experience: '5 years',
          workSampleUrl: 'https://example.com',
        },
      ],
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.success).toBe(false);
    expect(data.error).toBe('COURSE_ALREADY_ADDED');
  });

  // ─────────────────────────────────────────────────────────────────────
  // Validation
  // ─────────────────────────────────────────────────────────────────────

  it('should validate required fields', async () => {
    authenticateRequest.mockReturnValue({ sub: 'user-123' });
    requireTutor.mockReturnValue({ sub: 'user-123' });

    const request = buildRequest('POST', {
      courses: [
        {
          courseId: 'course-1',
          // Missing experience
          // Missing workSampleUrl
        },
      ],
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Authorization
  // ─────────────────────────────────────────────────────────────────────

  it('should return 401 if not authenticated', async () => {
    requireTutor.mockReturnValue(
      NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 })
    );

    const request = buildRequest('POST', {
      courses: [{ courseId: 'course-1', experience: '5y', workSampleUrl: 'url' }],
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('should return 403 if not a tutor', async () => {
    requireTutor.mockReturnValue(
      NextResponse.json({ success: false, error: 'TUTOR_NOT_APPROVED' }, { status: 403 })
    );

    const request = buildRequest('POST', {
      courses: [{ courseId: 'course-1', experience: '5y', workSampleUrl: 'url' }],
    });
    const response = await POST(request);

    expect(response.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// DELETE /api/tutor/courses/:courseId
// ─────────────────────────────────────────────────────────────────────────

describe('DELETE /api/tutor/courses/:courseId', () => {
  let DELETE_handler;

  beforeAll(() => {
    const route = require('@/app/api/tutor/courses/[courseId]/route');
    DELETE_handler = route.DELETE;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully delete tutor course', async () => {
    const tutorId = 'user-123';
    const courseId = 'course-1';
    authenticateRequest.mockReturnValue({ sub: tutorId });
    requireTutor.mockReturnValue({ sub: tutorId });

    prisma.tutorCourse.delete.mockResolvedValue({
      tutorId,
      courseId,
      status: 'Approved',
    });

    const request = new Request(`http://localhost/api/tutor/courses/${courseId}`, {
      method: 'DELETE',
    });
    const response = await DELETE_handler(request, {
      params: Promise.resolve({ courseId }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should return 404 if course not in tutor catalog', async () => {
    const tutorId = 'user-123';
    const courseId = 'nonexistent-course';
    authenticateRequest.mockReturnValue({ sub: tutorId });
    requireTutor.mockReturnValue({ sub: tutorId });

    // Simulate Prisma P2025 (record not found)
    prisma.tutorCourse.delete.mockRejectedValue({
      code: 'P2025',
    });

    const request = new Request(`http://localhost/api/tutor/courses/${courseId}`, {
      method: 'DELETE',
    });
    const response = await DELETE_handler(request, {
      params: Promise.resolve({ courseId }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
  });

  it('should return 403 if not authorized', async () => {
    requireTutor.mockReturnValue(
      NextResponse.json({ success: false, error: 'TUTOR_NOT_APPROVED' }, { status: 403 })
    );

    const request = new Request('http://localhost/api/tutor/courses/course-1', {
      method: 'DELETE',
    });
    const response = await DELETE_handler(request, {
      params: Promise.resolve({ courseId: 'course-1' }),
    });

    expect(response.status).toBe(403);
  });
});
