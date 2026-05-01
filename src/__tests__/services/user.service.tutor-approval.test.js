/**
 * Unit tests for user.service.js — tutor approval/rejection functions
 * Mocks the user repository to verify business logic only.
 */

jest.mock('@/lib/repositories/user.repository', () => ({
  findById: jest.fn(),
  update: jest.fn(),
}));

const userRepo = require('@/lib/repositories/user.repository');
const userService = require('@/lib/services/user.service');

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── approveTutor ────────────────────────────────────────────────────

describe('approveTutor', () => {
  it('approves a tutor when isTutorRequested is true', async () => {
    const user = {
      id: 'user-123',
      isTutorRequested: true,
      isTutorApproved: false,
    };
    userRepo.findById.mockResolvedValue(user);
    userRepo.update.mockResolvedValue({ ...user, isTutorApproved: true });

    const result = await userService.approveTutor('user-123');

    expect(userRepo.findById).toHaveBeenCalledWith('user-123');
    expect(userRepo.update).toHaveBeenCalledWith('user-123', { isTutorApproved: true });
    expect(result.isTutorApproved).toBe(true);
  });

  it('throws NOT_FOUND when user does not exist', async () => {
    userRepo.findById.mockResolvedValue(null);

    await expect(userService.approveTutor('bad-user')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'User not found',
    });
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('throws INVALID_STATE when user has not requested tutor role', async () => {
    const user = {
      id: 'user-123',
      isTutorRequested: false,
      isTutorApproved: false,
    };
    userRepo.findById.mockResolvedValue(user);

    await expect(userService.approveTutor('user-123')).rejects.toMatchObject({
      code: 'INVALID_STATE',
      message: 'User has not requested tutor role',
    });
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('throws INVALID_STATE when user is already approved as tutor', async () => {
    const user = {
      id: 'user-123',
      isTutorRequested: true,
      isTutorApproved: true,
    };
    userRepo.findById.mockResolvedValue(user);

    await expect(userService.approveTutor('user-123')).rejects.toMatchObject({
      code: 'INVALID_STATE',
      message: 'User is already approved as tutor',
    });
    expect(userRepo.update).not.toHaveBeenCalled();
  });
});

// ─── rejectTutor ─────────────────────────────────────────────────────

describe('rejectTutor', () => {
  it('rejects a tutor when isTutorRequested is true', async () => {
    const user = {
      id: 'user-456',
      isTutorRequested: true,
      isTutorApproved: false,
    };
    userRepo.findById.mockResolvedValue(user);
    userRepo.update.mockResolvedValue({
      ...user,
      isTutorRequested: false,
      isTutorApproved: false,
    });

    const result = await userService.rejectTutor('user-456');

    expect(userRepo.findById).toHaveBeenCalledWith('user-456');
    expect(userRepo.update).toHaveBeenCalledWith('user-456', {
      isTutorRequested: false,
      isTutorApproved: false,
    });
    expect(result.isTutorRequested).toBe(false);
  });

  it('rejects an already-approved tutor (resets to not requested)', async () => {
    const user = {
      id: 'user-789',
      isTutorRequested: true,
      isTutorApproved: true,
    };
    userRepo.findById.mockResolvedValue(user);
    userRepo.update.mockResolvedValue({
      ...user,
      isTutorRequested: false,
      isTutorApproved: false,
    });

    const result = await userService.rejectTutor('user-789');

    expect(userRepo.update).toHaveBeenCalledWith('user-789', {
      isTutorRequested: false,
      isTutorApproved: false,
    });
    expect(result.isTutorRequested).toBe(false);
    expect(result.isTutorApproved).toBe(false);
  });

  it('throws NOT_FOUND when user does not exist', async () => {
    userRepo.findById.mockResolvedValue(null);

    await expect(userService.rejectTutor('bad-user')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'User not found',
    });
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('throws INVALID_STATE when user has not requested tutor role', async () => {
    const user = {
      id: 'user-999',
      isTutorRequested: false,
      isTutorApproved: false,
    };
    userRepo.findById.mockResolvedValue(user);

    await expect(userService.rejectTutor('user-999')).rejects.toMatchObject({
      code: 'INVALID_STATE',
      message: 'User has not requested tutor role',
    });
    expect(userRepo.update).not.toHaveBeenCalled();
  });
});
