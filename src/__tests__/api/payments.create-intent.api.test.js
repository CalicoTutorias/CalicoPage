/**
 * @jest-environment node
 *
 * Regression tests for POST /api/payments/create-intent.
 *
 * These lock in the fix for the "every booking charges a flat 50 000 COP" bug:
 * the route MUST price the booking server-side (course price × duration) and
 * MUST ignore any client-supplied `amount`. A tampered amount in the body can
 * never reach Wompi.
 */

jest.mock('@/lib/services/wompi.service', () => ({
  createPaymentIntent: jest.fn(),
}));
jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
}));
jest.mock('@/lib/payments/pricing', () => ({
  resolveSessionAmount: jest.fn(),
}));

const WompiService = require('@/lib/services/wompi.service');
const { authenticateRequest } = require('@/lib/auth/middleware');
const { resolveSessionAmount } = require('@/lib/payments/pricing');
const { POST } = require('@/app/api/payments/create-intent/route');

function makeRequest(body) {
  return new Request('http://localhost/api/payments/create-intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  tutorId: 'tutor-1',
  courseId: 'course-1',
  amount: 1, // ← tampered: a student trying to pay 1 COP
  durationMinutes: 1, // ← tampered duration
  startTimestamp: '2026-05-03T13:00:00.000Z',
  endTimestamp: '2026-05-03T15:00:00.000Z', // 2 hours
  topicsToReview: 'Integrales',
  attachments: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  authenticateRequest.mockReturnValue({ sub: 'student-1' });
  WompiService.createPaymentIntent.mockResolvedValue({
    reference: 'TXN-1',
    checkoutUrl: 'https://checkout/x',
  });
});

describe('server-authoritative pricing', () => {
  it('charges the price the server computes, IGNORING the client amount', async () => {
    // 2-hour booking of a 40 000/h course → 80 000, not the client's "1".
    resolveSessionAmount.mockResolvedValue({ amount: 80000, pricePerHour: 40000, hours: 2 });

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);

    expect(WompiService.createPaymentIntent).toHaveBeenCalledTimes(1);
    const passed = WompiService.createPaymentIntent.mock.calls[0][0];
    expect(passed.amount).toBe(80000);          // authoritative, not 1
    expect(passed.amount).not.toBe(validBody.amount);
    expect(passed.durationMinutes).toBe(120);   // derived from hours, not client's "1"
  });

  it('prices from the server-validated timestamps and course id', async () => {
    resolveSessionAmount.mockResolvedValue({ amount: 80000, pricePerHour: 40000, hours: 2 });

    await POST(makeRequest(validBody));

    const args = resolveSessionAmount.mock.calls[0][0];
    expect(args.courseId).toBe('course-1');
    expect(args.startTimestamp).toBeInstanceOf(Date);
    expect(args.endTimestamp).toBeInstanceOf(Date);
    expect(args.startTimestamp.toISOString()).toBe('2026-05-03T13:00:00.000Z');
  });

  it('works even when the client sends no amount at all', async () => {
    resolveSessionAmount.mockResolvedValue({ amount: 50000, pricePerHour: 50000, hours: 1 });
    const { amount, ...noAmount } = validBody;

    const res = await POST(makeRequest(noAmount));
    expect(res.status).toBe(200);
    expect(WompiService.createPaymentIntent.mock.calls[0][0].amount).toBe(50000);
  });
});

describe('pricing failures map to the right status', () => {
  it('returns 404 when the course is not found', async () => {
    const err = Object.assign(new Error('Course not found'), {
      name: 'PricingError', code: 'COURSE_NOT_FOUND',
    });
    resolveSessionAmount.mockRejectedValue(err);

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(404);
    expect(WompiService.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('returns 400 when the course has no valid price', async () => {
    const err = Object.assign(new Error('Course has no valid price'), {
      name: 'PricingError', code: 'NO_PRICE',
    });
    resolveSessionAmount.mockRejectedValue(err);

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
  });

  it('returns 500 for an unexpected (non-pricing) error', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    resolveSessionAmount.mockRejectedValue(new Error('db exploded'));

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});

describe('guards run before pricing', () => {
  it('returns 401 when unauthenticated (never prices)', async () => {
    const { NextResponse } = require('next/server');
    authenticateRequest.mockReturnValue(
      NextResponse.json({ error: 'no' }, { status: 401 }),
    );

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
    expect(resolveSessionAmount).not.toHaveBeenCalled();
  });

  it('returns 400 when courseId is missing', async () => {
    const { courseId, ...noCourse } = validBody;
    const res = await POST(makeRequest(noCourse));
    expect(res.status).toBe(400);
    expect(resolveSessionAmount).not.toHaveBeenCalled();
  });

  it('returns 400 when topicsToReview is missing', async () => {
    const { topicsToReview, ...noTopics } = validBody;
    const res = await POST(makeRequest(noTopics));
    expect(res.status).toBe(400);
    expect(resolveSessionAmount).not.toHaveBeenCalled();
  });
});
