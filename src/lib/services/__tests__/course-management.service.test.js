/**
 * @jest-environment node
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    course: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    courseSuggestion: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/repositories/academic.repository', () => ({
  findCoursesPageForAdmin: jest.fn(),
}));

jest.mock('@/lib/services/admin-audit.service', () => ({
  ADMIN_ACTIONS: {
    PRICE_UPDATE: 'PRICE_UPDATE',
    COURSE_UPDATE: 'COURSE_UPDATE',
    COURSE_SUGGESTION_APPROVE: 'COURSE_SUGGESTION_APPROVE',
  },
  logAction: jest.fn(),
}));

const prisma = require('@/lib/prisma').default;
const auditService = require('@/lib/services/admin-audit.service');
const courseManagement = require('@/lib/services/course-management.service');

const decimal = (value) => ({ toString: () => String(value), valueOf: () => value });

const EXISTING = {
  id: 'course-1',
  code: 'ISIS1001',
  name: 'Introducción',
  complexity: 'Introductory',
  careerId: 'career-isis',
  aliases: ['intro'],
  basePrice: decimal(40000),
};

describe('normalizeAliases', () => {
  it('trims, collapses spaces, drops empties and case-insensitive duplicates', () => {
    expect(courseManagement.normalizeAliases(['  Cálculo  1 ', '', 'cálculo 1', 'Calc', null]))
      .toEqual(['Cálculo 1', 'Calc']);
  });

  it('returns an empty list for non-arrays', () => {
    expect(courseManagement.normalizeAliases(undefined)).toEqual([]);
  });
});

describe('updateCourseAsAdmin', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates the price and keeps the PRICE_UPDATE audit payload', async () => {
    prisma.course.findUnique.mockResolvedValue(EXISTING);
    prisma.course.update.mockResolvedValue({ ...EXISTING, basePrice: decimal(50000) });

    const request = new Request('http://localhost/api/admin/courses', { method: 'PATCH' });
    const course = await courseManagement.updateCourseAsAdmin({
      adminId: 'admin-1', courseId: 'course-1', changes: { basePrice: 50000 }, request,
    });

    expect(prisma.course.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'course-1' },
      data: { basePrice: 50000 },
    }));
    expect(auditService.logAction).toHaveBeenCalledTimes(1);
    expect(auditService.logAction).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin-1',
      action: 'PRICE_UPDATE',
      targetType: 'Course',
      targetId: 'course-1',
      payload: { code: 'ISIS1001', previousBasePrice: '40000', newBasePrice: '50000' },
    }));
    expect(course.basePrice.toString()).toBe('50000');
  });

  it('writes only changed fields, normalizes code/aliases and logs COURSE_UPDATE', async () => {
    prisma.course.findUnique.mockResolvedValue(EXISTING);
    prisma.course.update.mockImplementation(({ data }) => Promise.resolve({ ...EXISTING, ...data }));

    await courseManagement.updateCourseAsAdmin({
      adminId: 'admin-1',
      courseId: 'course-1',
      changes: {
        code: ' isis1001 ',          // same after normalizing → not written
        name: 'Introducción a la programación',
        complexity: 'Introductory',  // unchanged
        careerId: 'career-mate',
        aliases: ['intro', ' IP ', 'ip'],
      },
    });

    expect(prisma.course.update).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        name: 'Introducción a la programación',
        careerId: 'career-mate',
        aliases: ['intro', 'IP'],
      },
    }));
    expect(auditService.logAction).toHaveBeenCalledTimes(1);
    expect(auditService.logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'COURSE_UPDATE',
      payload: {
        code: 'ISIS1001',
        changes: {
          name: { from: 'Introducción', to: 'Introducción a la programación' },
          careerId: { from: 'career-isis', to: 'career-mate' },
          aliases: { from: ['intro'], to: ['intro', 'IP'] },
        },
      },
    }));
  });

  it('logs both actions when price and other fields change together', async () => {
    prisma.course.findUnique.mockResolvedValue(EXISTING);
    prisma.course.update.mockImplementation(({ data }) => Promise.resolve({
      ...EXISTING, ...data, basePrice: decimal(data.basePrice),
    }));

    await courseManagement.updateCourseAsAdmin({
      adminId: 'admin-1', courseId: 'course-1', changes: { code: 'isis1002', basePrice: 45000 },
    });

    const actions = auditService.logAction.mock.calls.map(([entry]) => entry.action);
    expect(actions).toEqual(['PRICE_UPDATE', 'COURSE_UPDATE']);
  });

  it('does not write nor audit when nothing changed', async () => {
    prisma.course.findUnique.mockResolvedValue(EXISTING);

    const course = await courseManagement.updateCourseAsAdmin({
      adminId: 'admin-1', courseId: 'course-1', changes: { name: 'Introducción ', basePrice: 40000 },
    });

    expect(course).toBe(EXISTING);
    expect(prisma.course.update).not.toHaveBeenCalled();
    expect(auditService.logAction).not.toHaveBeenCalled();
  });

  it('rejects a non-existent course before attempting an update', async () => {
    prisma.course.findUnique.mockResolvedValue(null);

    await expect(courseManagement.updateCourseAsAdmin({
      adminId: 'admin-1', courseId: 'missing', changes: { basePrice: 50000 },
    })).rejects.toMatchObject({ code: 'COURSE_NOT_FOUND' });

    expect(prisma.course.update).not.toHaveBeenCalled();
    expect(auditService.logAction).not.toHaveBeenCalled();
  });
});

describe('approveSuggestion', () => {
  const SUGGESTION = { id: 'sug-1', code: 'ISIS9999', name: 'Materia nueva' };
  const request = new Request('http://localhost/api/admin/course-suggestions/sug-1/approve', { method: 'POST' });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.courseSuggestion.findUnique.mockResolvedValue(SUGGESTION);
    prisma.courseSuggestion.update.mockResolvedValue({ ...SUGGESTION, status: 'Approved' });
  });

  it.each([undefined, 0, -100, 'abc'])(
    'refuses to create a course with basePrice=%p (would fail checkout with NO_PRICE)',
    async (basePrice) => {
      prisma.course.findUnique.mockResolvedValue(null);
      await expect(courseManagement.approveSuggestion({
        suggestionId: 'sug-1', adminId: 'admin-1', request,
        courseData: { careerId: 'career-isis', basePrice },
      })).rejects.toMatchObject({ code: 'PRICE_REQUIRED' });
      expect(prisma.course.create).not.toHaveBeenCalled();
      expect(prisma.courseSuggestion.update).not.toHaveBeenCalled();
    },
  );

  it('creates the course with the given positive price', async () => {
    prisma.course.findUnique.mockResolvedValue(null);
    prisma.course.create.mockResolvedValue({ id: 'c-new', code: 'ISIS9999', name: 'Materia nueva' });
    await courseManagement.approveSuggestion({
      suggestionId: 'sug-1', adminId: 'admin-1', request,
      courseData: { careerId: 'career-isis', basePrice: 45000 },
    });
    expect(prisma.course.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ basePrice: 45000, careerId: 'career-isis' }),
    });
  });

  it('does not require a price when the suggestion maps to an existing course', async () => {
    prisma.course.findUnique.mockResolvedValue(EXISTING);
    await courseManagement.approveSuggestion({
      suggestionId: 'sug-1', adminId: 'admin-1', request, courseData: {},
    });
    expect(prisma.course.create).not.toHaveBeenCalled();
    expect(prisma.courseSuggestion.update).toHaveBeenCalled();
  });
});
