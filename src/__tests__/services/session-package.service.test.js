jest.mock('@/lib/repositories/session-package.repository', () => ({
  DROPPED_SESSION_STATUSES: ['Canceled', 'Rejected'],
  create: jest.fn(),
  findById: jest.fn(),
  findAll: jest.fn(),
  closeIfActive: jest.fn(),
  deleteIfUnused: jest.fn(),
}));
jest.mock('@/lib/services/admin-audit.service', () => ({
  ADMIN_ACTIONS: { SESSION_PACKAGE_CLOSE: 'SESSION_PACKAGE_CLOSE' },
  logAction: jest.fn(),
}));
jest.mock('@/lib/services/admin-metrics.service', () => ({ invalidateAllMetrics: jest.fn() }));

import * as repo from '@/lib/repositories/session-package.repository';
import * as audit from '@/lib/services/admin-audit.service';
import * as service from '@/lib/services/session-package.service';

const twoHours = (day, status = 'Accepted') => ({
  id: `s-${day}`,
  status,
  startTimestamp: new Date(`2026-11-${day}T14:00:00Z`),
  endTimestamp: new Date(`2026-11-${day}T16:00:00Z`),
});
const payment = (day, status) => ({
  id: `p-${day}`, amount: '93500', originalAmount: '110000', discountAmount: '16500', tutorPayoutBase: '101750',
  status: 'pending', session: twoHours(day, status),
});
const pkg = (overrides = {}) => ({
  id: 'pkg-1',
  committedMinutes: 480,
  discountPercent: '15',
  tutorSharePercent: '50',
  status: 'ACTIVE',
  student: { id: 'stu', name: 'Anónimo', email: 'a@b.co', kind: 'ExternalTemporary' },
  tutor: { id: 'tut', name: 'Daniel' },
  course: { id: 'ml', code: 'ISIS2611', name: 'ML' },
  payments: [payment('17'), payment('21')],
  ...overrides,
});
const booking = (overrides = {}) => ({
  packageId: 'pkg-1', studentId: 'stu', tutorId: 'tut', courseId: 'ml', durationMinutes: 120, ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe('resolveForBooking', () => {
  it('accepts a session of the same student, tutor and course with hours left', async () => {
    repo.findById.mockResolvedValue(pkg());
    await expect(service.resolveForBooking(booking())).resolves.toMatchObject({ id: 'pkg-1' });
  });

  it.each([
    ['studentId', 'other'],
    ['tutorId', 'other'],
    ['courseId', 'other'],
  ])('refuses another %s', async (field, value) => {
    repo.findById.mockResolvedValue(pkg());
    await expect(service.resolveForBooking(booking({ [field]: value }))).rejects.toMatchObject({ code: 'PACKAGE_MISMATCH' });
  });

  it('refuses a session longer than the hours left', async () => {
    repo.findById.mockResolvedValue(pkg({ payments: [payment('17'), payment('18'), payment('19')] }));
    await expect(service.resolveForBooking(booking({ durationMinutes: 180 }))).rejects.toMatchObject({ code: 'PACKAGE_HOURS_EXCEEDED' });
  });

  it('does not count canceled sessions', async () => {
    repo.findById.mockResolvedValue(pkg({
      payments: [payment('17'), payment('18'), payment('19'), payment('20', 'Canceled')],
    }));
    await expect(service.resolveForBooking(booking())).resolves.toBeTruthy();
  });

  it('refuses a closed package', async () => {
    repo.findById.mockResolvedValue(pkg({ status: 'CLOSED' }));
    await expect(service.resolveForBooking(booking())).rejects.toMatchObject({ code: 'PACKAGE_CLOSED' });
  });
});

describe('createForBooking', () => {
  it('copies the tier of the agreed hours', async () => {
    repo.create.mockImplementation(async (data) => data);
    const created = await service.createForBooking({
      adminId: 'adm', studentId: 'stu', tutorId: 'tut', courseId: 'ml', hours: 8, durationMinutes: 120,
    });
    expect(created).toMatchObject({ committedMinutes: 480, discountPercent: 15, tutorSharePercent: 50, createdById: 'adm' });
  });

  it('refuses fewer than 3 hours', async () => {
    await expect(service.createForBooking({ hours: 2, durationMinutes: 60 })).rejects.toMatchObject({ code: 'PACKAGE_INVALID_HOURS' });
  });
});

describe('closePackage', () => {
  it('records what the student owes when the hours taken fall into a lower tier', async () => {
    repo.findById.mockResolvedValue(pkg());
    repo.closeIfActive.mockResolvedValue(true);

    await service.closePackage({ adminId: 'adm', id: 'pkg-1' });

    // 4 h taken → 10 % tier: each session got 16 500 and deserved 11 000.
    expect(repo.closeIfActive).toHaveBeenCalledWith('pkg-1', { closedById: 'adm', usedMinutes: 240, settlementAmount: 11_000 });
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'SESSION_PACKAGE_CLOSE' }));
  });

  it('owes nothing when the hours taken keep the tier', async () => {
    repo.findById.mockResolvedValue(pkg({ payments: [payment('17'), payment('18'), payment('19')] }));
    repo.closeIfActive.mockResolvedValue(true);
    await service.closePackage({ adminId: 'adm', id: 'pkg-1' });
    expect(repo.closeIfActive).toHaveBeenCalledWith('pkg-1', expect.objectContaining({ usedMinutes: 360, settlementAmount: 0 }));
  });
});

describe('serializePackage', () => {
  it('reports hours used and left', () => {
    expect(service.serializePackage(pkg())).toMatchObject({
      committedHours: 8, usedHours: 4, remainingHours: 4, discountPercent: 15, settlementAmount: 11_000,
      totals: { sessions: 2, charged: 187_000, discount: 33_000 },
    });
  });
});
