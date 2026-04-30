/**
 * @jest-environment node
 *
 * Integration tests — Session Cancellation flow at the HTTP boundary.
 *
 * Routes covered:
 *   PUT /api/sessions/:id/cancel — Student cancels (reason + refund)
 *   PUT /api/sessions/:id/cancel — Tutor cancels (reason only)
 *   PUT /api/sessions/:id/cancel — Student provides refund after tutor canceled
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    session: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb({
      session: { update: jest.fn() },
    })),
  },
}));

jest.mock('@/lib/repositories/session.repository', () => ({
  __esModule: true,
  findById: jest.fn(),
}));

jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
}));

jest.mock('@/lib/services/email.service', () => ({
  sendSessionCancellationToStudent: jest.fn().mockResolvedValue(),
  sendSessionCancellationToTutor: jest.fn().mockResolvedValue(),
  sendSessionCancellationToAdmin: jest.fn().mockResolvedValue(),
}));

const prisma = require('@/lib/prisma').default;
const sessionRepo = require('@/lib/repositories/session.repository');
const { authenticateRequest } = require('@/lib/auth/middleware');
const { makeSession } = require('../fixtures/booking.fixtures');

beforeEach(() => {
  jest.clearAllMocks();
});

function buildPut(url, body = {}) {
  return new Request(url, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const STUDENT_AUTH = {
  sub: 42,
  email: 'laura@test.co',
  isTutorRequested: false,
  isTutorApproved: false,
};

const TUTOR_AUTH = {
  sub: 99,
  email: 'carlos@test.co',
  isTutorRequested: false,
  isTutorApproved: true,
};

const FUTURE_SESSION = new Date(Date.now() + 24 * 60 * 60 * 1000);

// ─── PUT /api/sessions/:id/cancel — Student Cancellation ────────────

describe('PUT /api/sessions/:id/cancel — student cancellation', () => {
  let PUT;
  beforeAll(() => {
    PUT = require('@/app/api/sessions/[id]/cancel/route').PUT;
  });

  it('test_student_should_be_able_to_cancel_with_reason_and_refund_method', async () => {
    authenticateRequest.mockReturnValue(STUDENT_AUTH);
    
    const session = makeSession({
      id: 'sess_1',
      startTimestamp: FUTURE_SESSION,
      status: 'Accepted',
    });
    
    sessionRepo.findById.mockResolvedValue(session);
    prisma.$transaction.mockImplementation(async (cb) => {
      const tx = { session: { update: jest.fn().mockResolvedValue({ ...session, status: 'Canceled' }) } };
      return cb(tx);
    });

    const res = await PUT(buildPut('http://x/api/sessions/sess_1/cancel', {
      reason: 'schedule conflict',
      refundMethod: 'use_future_session',
    }), { params: Promise.resolve({ id: 'sess_1' }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.session.status).toBe('Canceled');
  });

  it('test_should_require_reason_and_refund_method_for_student_cancellation', async () => {
    authenticateRequest.mockReturnValue(STUDENT_AUTH);
    const session = makeSession({ startTimestamp: FUTURE_SESSION });
    sessionRepo.findById.mockResolvedValue(session);

    const res = await PUT(buildPut('http://x/api/sessions/sess_1/cancel', { reason: 'test' }), { params: Promise.resolve({ id: 'sess_1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Missing required fields/);
  });

  it('test_should_require_refund_method_details_for_llave', async () => {
    authenticateRequest.mockReturnValue(STUDENT_AUTH);
    const session = makeSession({ startTimestamp: FUTURE_SESSION });
    sessionRepo.findById.mockResolvedValue(session);

    const res = await PUT(buildPut('http://x/api/sessions/sess_1/cancel', {
      reason: 'test',
      refundMethod: 'llave',
    }), { params: Promise.resolve({ id: 'sess_1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Llave requires payment details/);
  });

  it('test_should_reject_student_cancel_within_6_hours', async () => {
    authenticateRequest.mockReturnValue(STUDENT_AUTH);
    const session = makeSession({
      startTimestamp: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });
    sessionRepo.findById.mockResolvedValue(session);

    const res = await PUT(buildPut('http://x/api/sessions/sess_1/cancel', {
      reason: 'test',
      refundMethod: 'use_future_session',
    }), { params: Promise.resolve({ id: 'sess_1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('CANCELLATION_DEADLINE_PASSED');
  });

  it('test_should_reject_non_student_from_canceling', async () => {
    authenticateRequest.mockReturnValue({ sub: 999, email: 'other@test.co' });
    const session = makeSession({ startTimestamp: FUTURE_SESSION });
    sessionRepo.findById.mockResolvedValue(session);

    const res = await PUT(buildPut('http://x/api/sessions/sess_1/cancel', {
      reason: 'test',
      refundMethod: 'use_future_session',
    }), { params: Promise.resolve({ id: 'sess_1' }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Only students or tutors can cancel/);
  });

  it('test_should_reject_canceling_already_canceled_session', async () => {
    authenticateRequest.mockReturnValue(STUDENT_AUTH);
    const session = makeSession({ status: 'Canceled' });
    sessionRepo.findById.mockResolvedValue(session);

    const res = await PUT(buildPut('http://x/api/sessions/sess_1/cancel', {
      reason: 'test',
      refundMethod: 'use_future_session',
    }), { params: Promise.resolve({ id: 'sess_1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Cannot cancel a canceled session/);
  });
});

// ─── PUT /api/sessions/:id/cancel — Tutor Cancellation ────────────────

describe('PUT /api/sessions/:id/cancel — tutor cancellation', () => {
  let PUT;
  beforeAll(() => {
    PUT = require('@/app/api/sessions/[id]/cancel/route').PUT;
  });

  it('test_tutor_should_be_able_to_cancel_with_reason_only', async () => {
    authenticateRequest.mockReturnValue(TUTOR_AUTH);
    
    const session = makeSession({
      id: 'sess_1',
      startTimestamp: FUTURE_SESSION,
      status: 'Accepted',
    });
    
    sessionRepo.findById.mockResolvedValue(session);
    prisma.$transaction.mockImplementation(async (cb) => {
      const tx = { session: { update: jest.fn().mockResolvedValue({ ...session, status: 'Canceled' }) } };
      return cb(tx);
    });

    const res = await PUT(buildPut('http://x/api/sessions/sess_1/cancel', {
      reason: 'Emergency',
    }), { params: Promise.resolve({ id: 'sess_1' }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.waitingForRefund).toBe(true);
  });

  it('test_should_require_reason_for_tutor_cancellation', async () => {
    authenticateRequest.mockReturnValue(TUTOR_AUTH);
    const session = makeSession({ startTimestamp: FUTURE_SESSION });
    sessionRepo.findById.mockResolvedValue(session);

    const res = await PUT(buildPut('http://x/api/sessions/sess_1/cancel', {}), { params: Promise.resolve({ id: 'sess_1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Missing required field: reason/);
  });

  it('test_should_reject_tutor_cancel_within_6_hours', async () => {
    authenticateRequest.mockReturnValue(TUTOR_AUTH);
    const session = makeSession({
      startTimestamp: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });
    sessionRepo.findById.mockResolvedValue(session);

    const res = await PUT(buildPut('http://x/api/sessions/sess_1/cancel', {
      reason: 'Emergency',
    }), { params: Promise.resolve({ id: 'sess_1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('CANCELLATION_DEADLINE_PASSED');
  });
});

// ─── PUT /api/sessions/:id/cancel — Student provides refund after tutor canceled ─

describe('PUT /api/sessions/:id/cancel — student provides refund after tutor canceled', () => {
  let PUT;
  beforeAll(() => {
    PUT = require('@/app/api/sessions/[id]/cancel/route').PUT;
  });

  it('test_student_can_provide_refund_method_after_tutor_canceled', async () => {
    authenticateRequest.mockReturnValue(STUDENT_AUTH);
    
    const session = makeSession({
      id: 'sess_1',
      tutorId: 99,  // Must match cancelledBy for "tutor canceled" check
      startTimestamp: FUTURE_SESSION,
      status: 'Canceled',
      cancellationReason: 'Tutor emergency',
      cancelledBy: 99,
      refundMethod: null,
    });
    
    sessionRepo.findById.mockResolvedValue(session);
    prisma.$transaction.mockImplementation(async (cb) => {
      const tx = { 
        session: { 
          update: jest.fn().mockResolvedValue({ 
            ...session, 
            refundMethod: 'nequi',
            refundMethodDetails: '3101234567',
          }) 
        } 
      };
      return cb(tx);
    });

    const res = await PUT(buildPut('http://x/api/sessions/sess_1/cancel', {
      refundMethod: 'nequi',
      refundMethodDetails: '3101234567',
    }), { params: Promise.resolve({ id: 'sess_1' }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.session.refundMethod).toBe('nequi');
  });

  it('test_should_require_refund_method_when_providing_refund_after_tutor_canceled', async () => {
    authenticateRequest.mockReturnValue(STUDENT_AUTH);
    const session = makeSession({
      tutorId: 99,
      status: 'Canceled',
      cancelledBy: 99,
    });
    sessionRepo.findById.mockResolvedValue(session);

    const res = await PUT(buildPut('http://x/api/sessions/sess_1/cancel', {}), { params: Promise.resolve({ id: 'sess_1' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Refund method required/);
  });
});