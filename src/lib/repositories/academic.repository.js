/**
 * Academic Repository
 * Handles database operations for Careers, Courses, TutorCourses, and CoursePrices
 */

import prisma from '../prisma';
import { Prisma } from '../../generated/prisma';

// ===== CAREERS =====

export async function findAllCareers() {
  return prisma.career.findMany({
    orderBy: { name: 'asc' },
  });
}

export async function findCareerById(id) {
  return prisma.career.findUnique({
    where: { id },
  });
}

export async function findCareerByCode(code) {
  return prisma.career.findUnique({
    where: { code },
  });
}

// ===== COURSES =====

const COURSE_INCLUDE = {
  _count: {
    select: {
      tutorCourses: {
        where: {
          status: 'Approved',
          tutor: { user: { isTutorApproved: true } },
        },
      },
    },
  },
  career: { select: { id: true, code: true, name: true } },
};

// `availableTutorCount` (tutores VISIBLES para estudiantes) no se calcula
// aquí: depende de las horas libres del semáforo, que es lógica de servicio.
// Lo añade `academic.service` con `tutor-listing.service`.
function withApprovedTutorCount(course) {
  return {
    ...course,
    approvedTutorCount: course._count?.tutorCourses ?? 0,
  };
}

// Sin `limit` devuelve el catálogo completo: la búsqueda de materias corre en
// el cliente (Fuse) y un corte aquí esconde cursos del buscador.
export async function findAllCourses(limit) {
  const courses = await prisma.course.findMany({
    ...(limit ? { take: limit } : {}),
    orderBy: { name: 'asc' },
    include: COURSE_INCLUDE,
  });

  return courses.map(withApprovedTutorCount);
}

export async function findCourseById(id) {
  const course = await prisma.course.findUnique({
    where: { id },
    include: COURSE_INCLUDE,
  });
  return course ? withApprovedTutorCount(course) : null;
}

export async function findCourseByCode(code) {
  const course = await prisma.course.findUnique({
    where: { code },
    include: COURSE_INCLUDE,
  });
  return course ? withApprovedTutorCount(course) : null;
}

// ===== ADMIN COURSE LISTING =====

// Pliegue de tildes compartido entre JS y SQL para que "calculo" encuentre
// "Cálculo". Las dos cadenas deben tener la misma longitud (translate()).
const ACCENTED_CHARS = 'áéíóúüñàèìòùâêîôûç';
const PLAIN_CHARS = 'aeiouunaeiouaeiouc';

export function foldSearchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function escapeLikePattern(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

/**
 * Página del catálogo para el admin, filtrada y paginada en la base: busca en
 * código, nombre y aliases (sin distinguir mayúsculas ni tildes) y solo trae
 * los cursos de la página pedida.
 *
 * @param {{ search?: string, limit: number, offset: number }} args
 * @returns {Promise<{ courses: object[], total: number }>}
 */
export async function findCoursesPageForAdmin({ search, limit, offset }) {
  const term = foldSearchText(search);
  const where = term
    ? Prisma.sql`WHERE translate(
        lower(c.code || ' ' || c.name || ' ' || array_to_string(c.aliases, ' ')),
        ${ACCENTED_CHARS}, ${PLAIN_CHARS}
      ) LIKE ${`%${escapeLikePattern(term)}%`}`
    : Prisma.empty;

  const [countRows, idRows] = await Promise.all([
    prisma.$queryRaw`SELECT COUNT(*)::int AS total FROM courses c ${where}`,
    prisma.$queryRaw`
      SELECT c.id FROM courses c ${where}
      ORDER BY c.name ASC, c.code ASC
      LIMIT ${limit} OFFSET ${offset}`,
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const ids = idRows.map((row) => row.id);
  if (ids.length === 0) return { courses: [], total };

  const rows = await prisma.course.findMany({
    where: { id: { in: ids } },
    include: COURSE_INCLUDE,
  });
  const byId = new Map(rows.map((course) => [course.id, withApprovedTutorCount(course)]));
  return { courses: ids.map((id) => byId.get(id)).filter(Boolean), total };
}

export async function createCourse(data) {
  return prisma.course.create({
    data: {
      code: data.code,
      name: data.name,
      complexity: data.complexity,
      basePrice: data.basePrice,
      careerId: data.careerId,
      ...(Array.isArray(data.aliases) && { aliases: data.aliases }),
    },
    include: COURSE_INCLUDE,
  });
}

// ===== TUTOR COURSES =====

const TUTOR_COURSE_INCLUDE = {
  course: true,
};

export async function findTutorCourses(tutorId, limit = 50) {
  return prisma.tutorCourse.findMany({
    where: { tutorId },
    include: TUTOR_COURSE_INCLUDE,
    take: limit,
  });
}

export async function findTutorCoursesByStatus(tutorId, status, limit = 50) {
  return prisma.tutorCourse.findMany({
    where: { tutorId, status },
    include: TUTOR_COURSE_INCLUDE,
    take: limit,
  });
}

export async function findTutorsForCourse(courseId, limit = 50) {
  return prisma.tutorCourse.findMany({
    where: { courseId, status: 'Approved' },
    include: {
      tutor: { include: { user: true } },
      course: true,
    },
    take: limit,
  });
}

export async function addTutorCourse(tutorId, courseId, { experience, workSampleUrl } = {}) {
  return prisma.tutorCourse.create({
    data: {
      tutorId,
      courseId,
      status: 'Pending',
      ...(experience ? { experience } : {}),
      ...(workSampleUrl ? { workSampleUrl } : {}),
    },
    include: TUTOR_COURSE_INCLUDE,
  });
}

export async function addTutorCourses(tutorId, courses) {
  return prisma.$transaction(
    courses.map(({ courseId, experience, workSampleUrl }) =>
      prisma.tutorCourse.create({
        data: {
          tutorId,
          courseId,
          status: 'Pending',
          ...(experience ? { experience } : {}),
          ...(workSampleUrl ? { workSampleUrl } : {}),
        },
        include: TUTOR_COURSE_INCLUDE,
      }),
    ),
  );
}

export async function updateTutorCourseStatus(tutorId, courseId, status) {
  return prisma.tutorCourse.update({
    where: { tutorId_courseId: { tutorId, courseId } },
    data: { status },
    include: TUTOR_COURSE_INCLUDE,
  });
}

export async function findTutorCourse(tutorId, courseId) {
  return prisma.tutorCourse.findUnique({
    where: { tutorId_courseId: { tutorId, courseId } },
  });
}

/**
 * Move a row to `to` only if it is still in `from`, atomically: a course that an
 * admin rejected a moment ago cannot be brought back by a tutor's stale resume.
 * @returns {Promise<boolean>} whether the row moved
 */
export async function moveTutorCourseStatus(tutorId, courseId, from, to) {
  const { count } = await prisma.tutorCourse.updateMany({
    where: { tutorId, courseId, status: from },
    data: { status: to },
  });
  return count > 0;
}

export async function removeTutorCourse(tutorId, courseId) {
  await prisma.tutorCourse.delete({
    where: { tutorId_courseId: { tutorId, courseId } },
  });
}

// ===== PENDING COURSE REQUESTS (admin view) =====

export async function findAllPendingCourseRequests() {
  return prisma.tutorCourse.findMany({
    where: { status: 'Pending' },
    include: {
      course: true,
      tutor: { include: { user: true } },
    },
    orderBy: { course: { name: 'asc' } },
  });
}
