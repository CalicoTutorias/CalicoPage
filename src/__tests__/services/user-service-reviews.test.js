/**
 * Unit tests for UserService.getReviewsReceived and getReviewStats
 * Mocks authFetch to verify the frontend service logic.
 */

jest.mock('@/app/services/authFetch', () => ({
  authFetch: jest.fn(),
}));

const { authFetch } = require('@/app/services/authFetch');
const { UserService } = require('@/app/services/core/UserService');

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── getReviewsReceived ──────────────────────────────────────────────

describe('UserService.getReviewsReceived', () => {
  it('returns reviews on success', async () => {
    const mockReviews = [
      { id: 'r1', rating: 5, comment: 'Excelente', student: { id: 1, name: 'Ana' } },
      { id: 'r2', rating: 4, comment: 'Muy bueno', student: { id: 2, name: 'Luis' } },
    ];

    authFetch.mockResolvedValue({
      ok: true,
      data: { success: true, reviews: mockReviews, count: 2 },
    });

    const result = await UserService.getReviewsReceived(10, 20);

    expect(authFetch).toHaveBeenCalledWith('/api/users/10/reviews?limit=20');
    expect(result.success).toBe(true);
    expect(result.reviews).toHaveLength(2);
    expect(result.count).toBe(2);
  });

  it('returns empty array when API fails', async () => {
    authFetch.mockResolvedValue({ ok: false, data: null });

    const result = await UserService.getReviewsReceived(10);

    expect(result.success).toBe(false);
    expect(result.reviews).toEqual([]);
    expect(result.count).toBe(0);
  });

  it('returns empty array when userId is falsy', async () => {
    const result = await UserService.getReviewsReceived(null);

    expect(authFetch).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.reviews).toEqual([]);
  });

  it('uses default limit of 20', async () => {
    authFetch.mockResolvedValue({
      ok: true,
      data: { success: true, reviews: [], count: 0 },
    });

    await UserService.getReviewsReceived(5);

    expect(authFetch).toHaveBeenCalledWith('/api/users/5/reviews?limit=20');
  });

  it('handles missing reviews field in response', async () => {
    authFetch.mockResolvedValue({
      ok: true,
      data: { success: true },
    });

    const result = await UserService.getReviewsReceived(5);

    expect(result.success).toBe(true);
    expect(result.reviews).toEqual([]);
    expect(result.count).toBe(0);
  });
});

// ─── getReviewStats ──────────────────────────────────────────────────

describe('UserService.getReviewStats', () => {
  it('returns average and count on success', async () => {
    authFetch.mockResolvedValue({
      ok: true,
      data: { success: true, average: 4.5, count: 12 },
    });

    const result = await UserService.getReviewStats(10);

    expect(authFetch).toHaveBeenCalledWith('/api/users/10/reviews/stats');
    expect(result.success).toBe(true);
    expect(result.average).toBe(4.5);
    expect(result.count).toBe(12);
  });

  it('returns zeros when API fails', async () => {
    authFetch.mockResolvedValue({ ok: false, data: null });

    const result = await UserService.getReviewStats(10);

    expect(result.success).toBe(false);
    expect(result.average).toBe(0);
    expect(result.count).toBe(0);
  });

  it('returns zeros when userId is falsy', async () => {
    const result = await UserService.getReviewStats(undefined);

    expect(authFetch).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.average).toBe(0);
    expect(result.count).toBe(0);
  });

  it('handles missing fields in response', async () => {
    authFetch.mockResolvedValue({
      ok: true,
      data: { success: true },
    });

    const result = await UserService.getReviewStats(5);

    expect(result.success).toBe(true);
    expect(result.average).toBe(0);
    expect(result.count).toBe(0);
  });
});
