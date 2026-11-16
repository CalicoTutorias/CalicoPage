import prisma from '../prisma';
import * as auditService from './admin-audit.service';
import { findCoursesPageForAdmin } from '../repositories/academic.repository';

const { ADMIN_ACTIONS } = auditService;

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

/**
 * Aliases limpios para la búsqueda (Fuse): sin espacios sobrantes, sin vacíos
 * y sin repetidos (sin distinguir mayúsculas). Conserva el primer formato.
 */
export function normalizeAliases(aliases) {
  if (!Array.isArray(aliases)) return [];
  const seen = new Set();
  const result = [];
  for (const raw of aliases) {
    const alias = String(raw ?? '').trim().replace(/\s+/g, ' ');
    const key = alias.toLowerCase();
    if (!alias || seen.has(key)) continue;
    seen.add(key);
    result.push(alias);
  }
  return result;
}

function sameAliases(a = [], b = []) {
  return a.length === b.length && a.every((alias, i) => alias === b[i]);
}

const ADMIN_COURSE_SELECT = {
  id: true,
  code: true,
  name: true,
  complexity: true,
  careerId: true,
  aliases: true,
  basePrice: true,
};

export async function listCoursesForAdmin({ search, limit, offset }) {
  return findCoursesPageForAdmin({ search, limit, offset });
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
      careerId: data.careerId,
      aliases: normalizeAliases(data.aliases),
    },
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

/**
 * Edita un curso desde el admin. Solo escribe los campos que realmente
 * cambiaron y deja rastro en el log de auditoría:
 *   - precio      → PRICE_UPDATE (mismo payload de siempre)
 *   - el resto    → COURSE_UPDATE con { campo: { from, to } }
 *
 * @param {{ adminId: string, courseId: string, changes: {
 *   code?: string, name?: string, complexity?: string, careerId?: string,
 *   aliases?: string[], basePrice?: number }, request?: Request }} args
 * @throws COURSE_NOT_FOUND | Prisma P2002 (código repetido) | P2003 (carrera inválida)
 */
export async function updateCourseAsAdmin({ adminId, courseId, changes, request }) {
  const existing = await prisma.course.findUnique({
    where: { id: courseId },
    select: ADMIN_COURSE_SELECT,
  });

  if (!existing) {
    const err = new Error('COURSE_NOT_FOUND');
    err.code = 'COURSE_NOT_FOUND';
    throw err;
  }

  const data = {};
  if (changes.code !== undefined) {
    const code = normalizeCode(changes.code);
    if (code !== existing.code) data.code = code;
  }
  if (changes.name !== undefined) {
    const name = changes.name.trim();
    if (name !== existing.name) data.name = name;
  }
  if (changes.complexity !== undefined && changes.complexity !== existing.complexity) {
    data.complexity = changes.complexity;
  }
  if (changes.careerId !== undefined && changes.careerId !== existing.careerId) {
    data.careerId = changes.careerId;
  }
  if (changes.aliases !== undefined) {
    const aliases = normalizeAliases(changes.aliases);
    if (!sameAliases(aliases, existing.aliases)) data.aliases = aliases;
  }
  if (changes.basePrice !== undefined && Number(existing.basePrice) !== changes.basePrice) {
    data.basePrice = changes.basePrice;
  }

  if (Object.keys(data).length === 0) return existing;

  const course = await prisma.course.update({
    where: { id: courseId },
    data,
    include: { career: { select: { id: true, code: true, name: true } } },
  });

  const { basePrice, ...otherChanges } = data;

  if (basePrice !== undefined) {
    await auditService.logAction({
      adminId,
      action: ADMIN_ACTIONS.PRICE_UPDATE,
      targetType: 'Course',
      targetId: course.id,
      request,
      payload: {
        code: course.code,
        previousBasePrice: existing.basePrice.toString(),
        newBasePrice: course.basePrice.toString(),
      },
    });
  }

  const changedFields = Object.keys(otherChanges);
  if (changedFields.length > 0) {
    await auditService.logAction({
      adminId,
      action: ADMIN_ACTIONS.COURSE_UPDATE,
      targetType: 'Course',
      targetId: course.id,
      request,
      payload: {
        code: course.code,
        changes: Object.fromEntries(
          changedFields.map((field) => [field, { from: existing[field], to: course[field] }]),
        ),
      },
    });
  }

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
    if (!courseData?.careerId) {
      const err = new Error('CAREER_REQUIRED');
      err.code = 'CAREER_REQUIRED';
      throw err;
    }
    // A course without a positive price can't be booked (checkout throws
    // NO_PRICE), so never create one. The route validates range/integer;
    // this guards any other caller of the service.
    const basePrice = Number(courseData?.basePrice);
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      const err = new Error('PRICE_REQUIRED');
      err.code = 'PRICE_REQUIRED';
      throw err;
    }
    course = await prisma.course.create({
      data: {
        code: normalizeCode(courseData?.code || suggestion.code),
        name: (courseData?.name || suggestion.name).trim(),
        complexity: courseData?.complexity || 'Introductory',
        basePrice,
        careerId: courseData.careerId,
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
