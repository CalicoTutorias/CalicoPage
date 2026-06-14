/**
 * Tests for admin-users.service (the admin "Usuarios" directory).
 *
 * Focus:
 *   - getUserProfile shapes stats correctly and applies the 85% tutor share
 *     via fees.js for `earned` / `earnedPending`.
 *   - The 12-month activity axis is continuous and maps the current month.
 *   - SECURITY: the Prisma `select` allow-lists never request sensitive
 *     columns (passwordHash, verification / reset / OTP tokens). This is the
 *     unit-test guard behind requireAdminUser.
 *   - listUsers builds the right WHERE for each role filter.
 */

jest.mock('@/lib/repositories/admin-users.repository', () => ({
  tutorSessionStats: jest.fn(),
  studentSessionStats: jest.fn(),
  financialStats: jest.fn(),
  monthlyActivity: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    tutorCourse: { findMany: jest.fn() },
    session: { findMany: jest.fn() },
  },
}));

const service = require('@/lib/services/admin-users.service');
const statsRepo = require('@/lib/repositories/admin-users.repository');
const prisma = require('@/lib/prisma').default;

const SENSITIVE = [
  'passwordHash',
  'verificationToken',
  'verificationTokenExpiry',
  'resetToken',
  'resetTokenExpiry',
  'otpCode',
  'otpCodeExpiry',
];

function primeStats(overrides = {}) {
  statsRepo.tutorSessionStats.mockResolvedValue({
    completed: 5, canceled: 1, upcoming: 0, total: 6, distinctCourses: 2, distinctStudents: 4,
  });
  statsRepo.studentSessionStats.mockResolvedValue({
    completed: 2, canceled: 0, upcoming: 1, total: 3, distinctCourses: 1, distinctTutors: 2,
  });
  statsRepo.financialStats.mockResolvedValue({
    spentGross: 100000, spentPayments: 2,
    earnedGross: 200000, earnedPayments: 5, earnedGrossPending: 50000,
    ...overrides,
  });
  statsRepo.monthlyActivity.mockResolvedValue({ tutor: [], student: [] });
  prisma.tutorCourse.findMany.mockResolvedValue([]);
  prisma.session.findMany.mockResolvedValue([]);
}

describe('admin-users.service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getUserProfile', () => {
    it('returns null when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      expect(await service.getUserProfile('missing')).toBeNull();
    });

    it('returns null for an empty id without hitting the DB', async () => {
      expect(await service.getUserProfile('   ')).toBeNull();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('applies the 85% tutor share to earned / earnedPending', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1', name: 'Ana', email: 'ana@x.com', isTutorApproved: true,
        tutorProfile: { review: 4.5, numReview: 3 },
        _count: { reviewsReceived: 3, reviewsWritten: 1 },
      });
      primeStats();

      const p = await service.getUserProfile('u1');

      expect(p.stats.asTutor.earned).toBeCloseTo(170000, 2);        // 85% of 200000
      expect(p.stats.asTutor.earnedPending).toBeCloseTo(42500, 2);  // 85% of 50000
      expect(p.stats.asStudent.spent).toBe(100000);
      expect(p.stats.asTutor.reviewsReceived).toBe(3);
      expect(p.stats.asStudent.reviewsWritten).toBe(1);
    });

    it('builds a continuous 12-month activity axis and maps the current month', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', name: 'Ana', _count: {} });
      primeStats();
      const now = new Date();
      const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      statsRepo.monthlyActivity.mockResolvedValue({
        tutor: [{ month: thisMonth.toISOString(), n: 7 }],
        student: [],
      });

      const p = await service.getUserProfile('u1');

      expect(p.activitySeries).toHaveLength(12);
      expect(p.activitySeries[11].asTutor).toBe(7); // last bucket = current month
      expect(p.activitySeries[0].asTutor).toBe(0);
    });

    it('never selects sensitive columns (security allow-list)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', name: 'Ana', _count: {} });
      primeStats();

      await service.getUserProfile('u1');

      const { select } = prisma.user.findUnique.mock.calls[0][0];
      for (const field of SENSITIVE) expect(select[field]).toBeUndefined();
      expect(select.email).toBe(true);
      expect(select.name).toBe(true);
    });
  });

  describe('listUsers', () => {
    beforeEach(() => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);
    });

    const whereFor = async (args) => {
      await service.listUsers(args);
      return prisma.user.findMany.mock.calls.at(-1)[0].where;
    };

    it('filters tutors by isTutorApproved', async () => {
      expect(await whereFor({ role: 'tutors' })).toMatchObject({ isTutorApproved: true });
    });

    it('filters students by non-tutor STUDENT role', async () => {
      expect(await whereFor({ role: 'students' })).toMatchObject({ isTutorApproved: false, role: 'STUDENT' });
    });

    it('filters admins by role', async () => {
      expect(await whereFor({ role: 'admins' })).toMatchObject({ role: 'ADMIN' });
    });

    it('filters suspended by isActive=false', async () => {
      expect(await whereFor({ role: 'suspended' })).toMatchObject({ isActive: false });
    });

    it('applies a case-insensitive name/email OR search', async () => {
      const where = await whereFor({ role: 'all', search: 'ana' });
      expect(where.OR).toEqual([
        { name:  { contains: 'ana', mode: 'insensitive' } },
        { email: { contains: 'ana', mode: 'insensitive' } },
      ]);
    });

    it('list rows never select sensitive columns', async () => {
      await service.listUsers({ role: 'all' });
      const { select } = prisma.user.findMany.mock.calls[0][0];
      for (const field of SENSITIVE) expect(select[field]).toBeUndefined();
      expect(select.email).toBe(true);
    });
  });
});
