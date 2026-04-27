/**
 * @jest-environment node
 *
 * Integration tests for tutor application API (POST /api/auth/request-tutor)
 * Tests the complete flow: validation → authentication → database transaction
 */

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    tutorProfile: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

// Mock authentication
jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
}));

const prisma = require('@/lib/prisma').default;
const { authenticateRequest } = require('@/lib/auth/middleware');

describe('POST /api/auth/request-tutor', () => {
  let POST;

  beforeAll(() => {
    const route = require('@/app/api/auth/request-tutor/route');
    POST = route.POST;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildRequest(method, body) {
    return new Request('http://localhost/api/auth/request-tutor', {
      method,
      body: JSON.stringify(body),
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Happy Path
  // ─────────────────────────────────────────────────────────────────────

  it('should successfully create tutor profile and update user', async () => {
    const userId = 'user-123';
    const schoolEmail = 'john.doe@universidad.com';

    // Mock auth
    authenticateRequest.mockReturnValue({ sub: userId });

    // Mock user lookup
    const existingUser = {
      id: userId,
      email: 'john@example.com',
      isTutorRequested: false,
      isTutorApproved: false,
    };
    prisma.user.findUnique.mockResolvedValue(existingUser);

    // Mock transaction
    const updatedUser = {
      id: userId,
      email: 'john@example.com',
      isTutorRequested: true,
      isTutorApproved: false,
      tutorProfile: { id: 'tp-1', userId, schoolEmail },
      passwordHash: undefined,
      verificationToken: undefined,
      resetToken: undefined,
      resetTokenExpiry: undefined,
      otpCode: undefined,
      otpCodeExpiry: undefined,
    };

    prisma.$transaction.mockImplementation((cb) => cb());
    prisma.tutorProfile.create.mockResolvedValue({
      id: 'tp-1',
      userId,
      schoolEmail,
    });
    prisma.user.update.mockResolvedValue(updatedUser);

    const request = buildRequest('POST', { schoolEmail });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.user.isTutorRequested).toBe(true);
    expect(data.user.tutorProfile).toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('should return 201 with user data (sensitive fields stripped)', async () => {
    const userId = 'user-456';
    const schoolEmail = 'jane.doe@university.edu';

    authenticateRequest.mockReturnValue({ sub: userId });
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      isTutorRequested: false,
      isTutorApproved: false,
    });

    const updatedUser = {
      id: userId,
      email: 'jane@example.com',
      isTutorRequested: true,
      isTutorApproved: false,
      tutorProfile: { id: 'tp-2', schoolEmail },
      passwordHash: 'secret-hash',
      verificationToken: 'token',
      resetToken: 'reset-token',
      resetTokenExpiry: new Date(),
      otpCode: '123456',
      otpCodeExpiry: new Date(),
    };

    prisma.$transaction.mockImplementation((cb) => cb());
    prisma.tutorProfile.create.mockResolvedValue({ id: 'tp-2', userId, schoolEmail });
    prisma.user.update.mockResolvedValue(updatedUser);

    const request = buildRequest('POST', { schoolEmail });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.user.passwordHash).toBeUndefined();
    expect(data.user.verificationToken).toBeUndefined();
    expect(data.user.resetToken).toBeUndefined();
    expect(data.user.otpCode).toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────────────
  // Validation Errors
  // ─────────────────────────────────────────────────────────────────────

  it('should reject invalid school email format (not @.com)', async () => {
    authenticateRequest.mockReturnValue({ sub: 'user-123' });

    const request = buildRequest('POST', { schoolEmail: 'john@gmail.com' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Must be a valid');
  });

  it('should reject invalid email format', async () => {
    authenticateRequest.mockReturnValue({ sub: 'user-123' });

    const request = buildRequest('POST', { schoolEmail: 'not-an-email' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Invalid');
  });

  it('should reject missing schoolEmail field', async () => {
    authenticateRequest.mockReturnValue({ sub: 'user-123' });

    const request = buildRequest('POST', {});
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Authentication
  // ─────────────────────────────────────────────────────────────────────

  it('should return 401 if authentication fails', async () => {
    const errorResponse = new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
    });
    authenticateRequest.mockReturnValue(errorResponse);

    const request = buildRequest('POST', { schoolEmail: 'test@universidad.com' });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Business Logic Errors
  // ─────────────────────────────────────────────────────────────────────

  it('should return 404 if user not found', async () => {
    const userId = 'nonexistent-user';
    authenticateRequest.mockReturnValue({ sub: userId });
    prisma.user.findUnique.mockResolvedValue(null);

    const request = buildRequest('POST', { schoolEmail: 'test@universidad.com' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toContain('User not found');
  });

  it('should return 409 ALREADY_TUTOR if user is already an approved tutor', async () => {
    const userId = 'user-approved-tutor';
    authenticateRequest.mockReturnValue({ sub: userId });

    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      isTutorRequested: true,
      isTutorApproved: true, // Already approved
    });

    const request = buildRequest('POST', { schoolEmail: 'test@universidad.com' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.success).toBe(false);
    expect(data.error).toBe('ALREADY_TUTOR');
  });

  it('should return 409 TUTOR_REQUEST_PENDING if user already requested', async () => {
    const userId = 'user-pending-tutor';
    authenticateRequest.mockReturnValue({ sub: userId });

    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      isTutorRequested: true, // Already requested
      isTutorApproved: false,
    });

    const request = buildRequest('POST', { schoolEmail: 'test@universidad.com' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.success).toBe(false);
    expect(data.error).toBe('TUTOR_REQUEST_PENDING');
  });

  it('should return 409 SCHOOL_EMAIL_IN_USE if email already registered', async () => {
    const userId = 'user-123';
    const schoolEmail = 'taken@universidad.com';

    authenticateRequest.mockReturnValue({ sub: userId });
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      isTutorRequested: false,
      isTutorApproved: false,
    });

    // Simulate unique constraint error
    prisma.$transaction.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['school_email'] },
    });

    const request = buildRequest('POST', { schoolEmail });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.success).toBe(false);
    expect(data.error).toBe('SCHOOL_EMAIL_IN_USE');
  });

  // ─────────────────────────────────────────────────────────────────────
  // Database Errors
  // ─────────────────────────────────────────────────────────────────────

  it('should return 500 on unexpected database error', async () => {
    const userId = 'user-123';
    authenticateRequest.mockReturnValue({ sub: userId });

    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      isTutorRequested: false,
      isTutorApproved: false,
    });

    prisma.$transaction.mockRejectedValue(new Error('Database connection failed'));

    const request = buildRequest('POST', { schoolEmail: 'test@universidad.com' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Failed to submit tutor request');
  });
});
