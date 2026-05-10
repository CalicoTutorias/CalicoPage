/**
 * @jest-environment node
 *
 * Integration tests for tutor application API (POST /api/auth/request-tutor)
 * Tests the complete flow: validation → authentication → database transaction
 */

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

jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
}));

const prisma = require('@/lib/prisma').default;
const { authenticateRequest } = require('@/lib/auth/middleware');

describe('POST /api/auth/request-tutor', () => {
  let POST;

  beforeAll(() => {
    POST = require('@/app/api/auth/request-tutor/route').POST;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildPost(url, body = {}, headers = {}) {
    return new Request(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...headers },
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Happy path: User successfully submits tutor request
  // ─────────────────────────────────────────────────────────────────────

  it('should successfully create tutor profile and update user', async () => {
    const userId = 'user-123';
    const userBase = {
      id: userId,
      email: 'laura@test.co',
      name: 'Laura',
      isTutorRequested: false,
      isTutorApproved: false,
      passwordHash: 'hashed123',
      verificationToken: null,
      resetToken: null,
      resetTokenExpiry: null,
      otpCode: null,
      otpCodeExpiry: null,
    };

    authenticateRequest.mockReturnValue({ sub: userId });
    prisma.user.findUnique.mockResolvedValue(userBase);

    const updatedUser = {
      ...userBase,
      isTutorRequested: true,
      tutorProfile: {
        userId,
        schoolEmail: 'laura@universidad.com',
      },
    };

    // Mock $transaction to actually call the callback
    prisma.$transaction.mockImplementation(async (callback) => {
      const mockTx = {
        tutorProfile: {
          create: jest.fn().mockResolvedValue(updatedUser.tutorProfile),
        },
        user: {
          update: jest.fn().mockResolvedValue(updatedUser),
        },
      };
      return callback(mockTx);
    });

    const req = buildPost('http://x/api/auth/request-tutor', {
      schoolEmail: 'laura@universidad.com',
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.user.isTutorRequested).toBe(true);

    // Verify sensitive fields are stripped
    expect(data.user.passwordHash).toBeUndefined();
    expect(data.user.verificationToken).toBeUndefined();
    expect(data.user.resetToken).toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────────────
  // Authentication failures
  // ─────────────────────────────────────────────────────────────────────

  it('should return 401 if authentication fails', async () => {
    const { NextResponse } = require('next/server');
    authenticateRequest.mockReturnValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    );

    const req = buildPost('http://x/api/auth/request-tutor', {
      schoolEmail: 'laura@university.com',
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Validation errors
  // ─────────────────────────────────────────────────────────────────────

  it('should return 400 if schoolEmail is invalid format', async () => {
    authenticateRequest.mockReturnValue({ sub: 'user-123' });

    const req = buildPost('http://x/api/auth/request-tutor', {
      schoolEmail: 'not-an-email',
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBeTruthy();
  });

  it('should return 400 if schoolEmail is not @*.com domain', async () => {
    authenticateRequest.mockReturnValue({ sub: 'user-123' });

    const req = buildPost('http://x/api/auth/request-tutor', {
      schoolEmail: 'laura@test.org',
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it('should return 400 if schoolEmail is missing', async () => {
    authenticateRequest.mockReturnValue({ sub: 'user-123' });

    const req = buildPost('http://x/api/auth/request-tutor', {});
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Business logic errors
  // ─────────────────────────────────────────────────────────────────────

  it('should return 404 if user not found', async () => {
    const userId = 'nonexistent-user';
    authenticateRequest.mockReturnValue({ sub: userId });
    prisma.user.findUnique.mockResolvedValue(null);

    const req = buildPost('http://x/api/auth/request-tutor', {
      schoolEmail: 'laura@university.com',
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('not found');
  });

  it('should return 409 with ALREADY_TUTOR if user already approved', async () => {
    const userId = 'user-123';
    authenticateRequest.mockReturnValue({ sub: userId });

    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      isTutorApproved: true,
      isTutorRequested: false,
    });

    const req = buildPost('http://x/api/auth/request-tutor', {
      schoolEmail: 'laura@university.com',
    });
    const res = await POST(req);

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe('ALREADY_TUTOR');
  });

  it('should return 409 with TUTOR_REQUEST_PENDING if user already requested', async () => {
    const userId = 'user-123';
    authenticateRequest.mockReturnValue({ sub: userId });

    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      isTutorApproved: false,
      isTutorRequested: true,
    });

    const req = buildPost('http://x/api/auth/request-tutor', {
      schoolEmail: 'laura@university.com',
    });
    const res = await POST(req);

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe('TUTOR_REQUEST_PENDING');
  });

  it('should return 409 with SCHOOL_EMAIL_IN_USE if email already exists', async () => {
    const userId = 'user-123';
    authenticateRequest.mockReturnValue({ sub: userId });

    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      isTutorApproved: false,
      isTutorRequested: false,
    });

    // Mock transaction to throw P2002 unique constraint error
    prisma.$transaction.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['school_email'] },
    });

    const req = buildPost('http://x/api/auth/request-tutor', {
      schoolEmail: 'laura@university.com',
    });
    const res = await POST(req);

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe('SCHOOL_EMAIL_IN_USE');
  });

  // ─────────────────────────────────────────────────────────────────────
  // Server errors
  // ─────────────────────────────────────────────────────────────────────

  it('should return 500 on unexpected database error', async () => {
    const userId = 'user-123';
    authenticateRequest.mockReturnValue({ sub: userId });

    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      isTutorApproved: false,
      isTutorRequested: false,
    });

    const dbError = new Error('Database connection failed');
    prisma.$transaction.mockRejectedValue(dbError);

    const req = buildPost('http://x/api/auth/request-tutor', {
      schoolEmail: 'laura@university.com',
    });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.success).toBe(false);
  });
});
