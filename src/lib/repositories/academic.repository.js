/**
 * Academic Repository
 * Handles database operations for Careers, Courses, TutorCourses, and CoursePrices
 */

import prisma from '../prisma';
import { countAvailableTutorsForCourses } from './course-notify.repository';

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

// Sin `limit` devuelve el catálogo completo: la búsqueda de materias corre en
// el cliente (Fuse) y un corte aquí esconde cursos del buscador.
export async function findAllCourses(limit) {
  const courses = await prisma.course.findMany({
    ...(limit ? { take: limit } : {}),
    orderBy: { name: 'asc' },
    include: COURSE_INCLUDE,
  });

  const availableCounts = await countAvailableTutorsForCourses(courses.map((course) => course.id));

  return courses.map((course) => ({
    ...course,
    approvedTutorCount: course._count?.tutorCourses ?? 0,
    availableTutorCount: availableCounts.get(course.id) ?? 0,
  }));
}

export async function findCourseById(id) {
  const course = await prisma.course.findUnique({
    where: { id },
    include: COURSE_INCLUDE,
  });
  if (!course) return null;
  const availableCounts = await countAvailableTutorsForCourses([course.id]);
  return {
    ...course,
    approvedTutorCount: course._count?.tutorCourses ?? 0,
    availableTutorCount: availableCounts.get(course.id) ?? 0,
  };
}

export async function findCourseByCode(code) {
  const course = await prisma.course.findUnique({
    where: { code },
    include: COURSE_INCLUDE,
  });
  if (!course) return null;
  const availableCounts = await countAvailableTutorsForCourses([course.id]);
  return {
    ...course,
    approvedTutorCount: course._count?.tutorCourses ?? 0,
    availableTutorCount: availableCounts.get(course.id) ?? 0,
  };
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

export async function updateCourse(id, data) {
  return prisma.course.update({
    where: { id },
    data,
    include: COURSE_INCLUDE,
  });
}

export async function deleteCourse(id) {
  await prisma.course.delete({ where: { id } });
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
