import prisma from '../prisma';
import * as auditService from './admin-audit.service';

const { ADMIN_ACTIONS } = auditService;

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

export async function createSuggestion({ requesterId, code, name, notes }) {
  const normalizedCode = normalizeCode(code);
  const existing = await prisma.course.findUnique({ where: { code: normalizedCode } });
  if (existing) {
    const err = new Error('COURSE_EXISTS');
    err.code = 'COURSE_EXISTS';
    throw err;
  }

  return prisma.courseSuggestion.create({
    data: {
      requesterId,
      code: normalizedCode,
      name: String(name || '').trim(),
      notes: notes?.trim() || null,
    },
    include: {
      requester: { select: { id: true, name: true, email: true, role: true, isTutorApproved: true } },
    },
  });
}

export async function listSuggestions({ status } = {}) {
  return prisma.courseSuggestion.findMany({
    where: status && status !== 'all' ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      requester: { select: { id: true, name: true, email: true, role: true, isTutorApproved: true } },
      course: { select: { id: true, code: true, name: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function createCourseAsAdmin({ adminId, data, request }) {
  const normalizedCode = normalizeCode(data.code);
  const course = await prisma.course.create({
    data: {
      code: normalizedCode,
      name: data.name.trim(),
      complexity: data.complexity,
      basePrice: data.basePrice,
      aliases: Array.isArray(data.aliases) ? data.aliases : [],
    },
    include: { coursePrice: true },
  });

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.COURSE_CREATE,
    targetType: 'Course',
    targetId: course.id,
    request,
    payload: { code: course.code, name: course.name },
  });

  return course;
}

export async function approveSuggestion({ suggestionId, adminId, courseData, request }) {
  const suggestion = await prisma.courseSuggestion.findUnique({ where: { id: suggestionId } });
  if (!suggestion) {
    const err = new Error('SUGGESTION_NOT_FOUND');
    err.code = 'NOT_FOUND';
    throw err;
  }

  let course = await prisma.course.findUnique({ where: { code: normalizeCode(suggestion.code) } });
  if (!course) {
    course = await prisma.course.create({
      data: {
        code: normalizeCode(courseData?.code || suggestion.code),
        name: (courseData?.name || suggestion.name).trim(),
        complexity: courseData?.complexity || 'Introductory',
        basePrice: courseData?.basePrice ?? 0,
        aliases: [],
      },
    });
  }

  const updated = await prisma.courseSuggestion.update({
    where: { id: suggestionId },
    data: {
      status: 'Approved',
      reviewedById: adminId,
      reviewedAt: new Date(),
      courseId: course.id,
    },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      course: true,
    },
  });

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.COURSE_SUGGESTION_APPROVE,
    targetType: 'CourseSuggestion',
    targetId: suggestionId,
    request,
    payload: { courseId: course.id, code: course.code, name: course.name },
  });

  return updated;
}

export async function rejectSuggestion({ suggestionId, adminId, request }) {
  const updated = await prisma.courseSuggestion.update({
    where: { id: suggestionId },
    data: {
      status: 'Rejected',
      reviewedById: adminId,
      reviewedAt: new Date(),
    },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      course: true,
    },
  });

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.COURSE_SUGGESTION_REJECT,
    targetType: 'CourseSuggestion',
    targetId: suggestionId,
    request,
    payload: { code: updated.code, name: updated.name },
  });

  return updated;
}
