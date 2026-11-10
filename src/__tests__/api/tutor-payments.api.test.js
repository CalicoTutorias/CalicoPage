/**
 * @jest-environment node
 *
 * GET /api/payments/tutor/[tutorId]: a tutor only ever reads their own payments,
 * and learns whether each one was transferred, never the admin's note or proof.
 */

jest.mock('@/lib/auth/middleware', () => ({ authenticateRequest: jest.fn() }));
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { payment: { findMany: jest.fn() } },
}));

const { NextResponse } = require('next/server');
const { authenticateRequest } = require('@/lib/auth/middleware');
const prisma = require('@/lib/prisma').default;
const { GET } = require('@/app/api/payments/tutor/[tutorId]/route');

const request = () => new Request('http://localhost/api/payments/tutor/other-tutor');

function stored(overrides = {}) {
  return {
    id: 'p1',
    amount: 100000,
    originalAmount: 100000,
    discountAmount: 0,
    tutorPayoutBase: 100000,
    status: 'paid',
    tutorPayoutStatus: 'pending',
    tutorPayoutAt: null,
    tutorPayoutNote: null,
    proofS3Key: null,
    createdAt: new Date('2026-10-30T15:00:00.000Z'),
    student: { id: 's1', name: 'Anónimo' },
    coupon: null,
    session: {
      id: 'ses1',
      status: 'Accepted',
      endTimestamp: new Date('2026-10-30T16:00:00.000Z'),
      course: { id: 'c1', name: 'Estructuras de Datos', code: 'ISIS1225' },
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  authenticateRequest.mockResolvedValue({ sub: 'tutor-1' });
  prisma.payment.findMany.mockResolvedValue([stored()]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /api/payments/tutor/[tutorId]', () => {
  it('test_should_answer_401_without_a_session', async () => {
    authenticateRequest.mockResolvedValue(NextResponse.json({ error: 'Missing' }, { status: 401 }));

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
  });

  it('test_should_read_the_payments_of_the_authenticated_tutor_not_the_url', async () => {
    await GET(request());

    expect(prisma.payment.findMany.mock.calls[0][0].where).toEqual({ tutorId: 'tutor-1' });
  });

  it('test_should_say_what_is_still_owed', async () => {
    const [row] = await (await GET(request())).json();

    expect(row.tutorPayoutState).toBe('owed');
    expect(row.tutorPayoutAt).toBeNull();
    expect(row.tutorOwed).toBe(85000);
  });

  it('test_should_say_when_it_was_transferred', async () => {
    prisma.payment.findMany.mockResolvedValue([
      stored({ tutorPayoutStatus: 'paid', tutorPayoutAt: new Date('2026-11-01T15:00:00.000Z') }),
    ]);

    const [row] = await (await GET(request())).json();

    expect(row.tutorPayoutState).toBe('paid');
    expect(row.tutorPayoutAt).toBe('2026-11-01T15:00:00.000Z');
  });

  it('test_should_not_expose_the_admin_note_nor_the_proof', async () => {
    prisma.payment.findMany.mockResolvedValue([
      stored({
        tutorPayoutStatus: 'paid',
        tutorPayoutNote: 'nota interna',
        proofS3Key: 'manual-payment-proofs/ses1/a1b2c3d4e5f6.png',
      }),
    ]);

    const body = JSON.stringify(await (await GET(request())).json());

    expect(body).not.toContain('nota interna');
    expect(body).not.toContain('manual-payment-proofs');
  });

  it('test_should_not_leak_an_unexpected_error', async () => {
    prisma.payment.findMany.mockRejectedValue(new Error('db at 10.0.0.1'));

    const res = await GET(request());

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Internal server error');
  });
});
