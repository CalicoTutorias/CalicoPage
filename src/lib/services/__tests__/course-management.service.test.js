jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    course: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/services/admin-audit.service', () => ({
  ADMIN_ACTIONS: { PRICE_UPDATE: 'PRICE_UPDATE' },
  logAction: jest.fn(),
}));

const prisma = require('@/lib/prisma').default;
const auditService = require('@/lib/services/admin-audit.service');
const courseManagement = require('@/lib/services/course-management.service');

describe('updateCoursePriceAsAdmin', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates an existing course and records the before/after price in the audit log', async () => {
    prisma.course.findUnique.mockResolvedValue({
      id: 'course-1', code: 'ISIS1001', name: 'Introducción', basePrice: { toString: () => '40000' },
    });
    prisma.course.update.mockResolvedValue({
      id: 'course-1', code: 'ISIS1001', name: 'Introducción', basePrice: { toString: () => '50000' },
    });

    const request = new Request('http://localhost/api/admin/courses', { method: 'PATCH' });
    const course = await courseManagement.updateCoursePriceAsAdmin({
      adminId: 'admin-1', courseId: 'course-1', basePrice: 50000, request,
    });

    expect(prisma.course.update).toHaveBeenCalledWith({
      where: { id: 'course-1' },
      data: { basePrice: 50000 },
    });
    expect(auditService.logAction).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin-1',
      action: 'PRICE_UPDATE',
      targetType: 'Course',
      targetId: 'course-1',
      payload: {
        code: 'ISIS1001',
        previousBasePrice: '40000',
        newBasePrice: '50000',
      },
    }));
    expect(course.basePrice.toString()).toBe('50000');
  });

  it('rejects a non-existent course before attempting an update', async () => {
    prisma.course.findUnique.mockResolvedValue(null);

    await expect(courseManagement.updateCoursePriceAsAdmin({
      adminId: 'admin-1', courseId: 'missing', basePrice: 50000,
    })).rejects.toMatchObject({ code: 'COURSE_NOT_FOUND' });

    expect(prisma.course.update).not.toHaveBeenCalled();
    expect(auditService.logAction).not.toHaveBeenCalled();
  });
});
