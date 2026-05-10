/**
 * Academic Repository
 * Handles database operations for Departments, Careers, Courses, Topics, TutorCourses, and CoursePrices
 */

import prisma from '../prisma';

// ===== DEPARTMENTS =====

export async function findAllDepartments() {
  return prisma.department.findMany({
    orderBy: { name: 'asc' },
    include: { careers: { orderBy: { name: 'asc' } } },
  });
}

export async function findDepartmentById(id) {
  return prisma.department.findUnique({
    where: { id },
    include: { careers: { orderBy: { name: 'asc' } } },
  });
}

// ===== CAREERS =====

export async function findAllCareers() {
  return prisma.career.findMany({
    orderBy: { name: 'asc' },
    include: { department: true },
  });
}

export async function findCareerById(id) {
  return prisma.career.findUnique({
    where: { id },
    include: { department: true },
  });
}

export async function findCareerByCode(code) {
  return prisma.career.findUnique({
    where: { code },
    include: { department: true },
  });
}

// ===== COURSES =====

const COURSE_INCLUDE = {
  topics: true,
  department: true,
  coursePrice: true,
  _count: { select: { tutorCourses: true } },
};

export async function findAllCourses(limit = 50) {
  return prisma.course.findMany({
    take: limit,
    orderBy: { name: 'asc' },
    include: COURSE_INCLUDE,
  });
}

export async function findCourseById(id) {
  return prisma.course.findUnique({
    where: { id },
    include: COURSE_INCLUDE,
  });
}

export async function findCourseByCode(code) {
  return prisma.course.findUnique({
    where: { code },
    include: COURSE_INCLUDE,
  });
}

export async function createCourse(data) {
  return prisma.course.create({
    data: {
      code: data.code,
      name: data.name,
      complexity: data.complexity,
      basePrice: data.basePrice,
      ...(data.departmentId && { departmentId: data.departmentId }),
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

// ===== TOPICS =====

export async function findTopicsByCourse(courseId, limit = 50) {
  return prisma.topic.findMany({
    where: { courseId },
    take: limit,
    orderBy: { name: 'asc' },
  });
}

export async function findTopicById(id) {
  return prisma.topic.findUnique({ where: { id } });
}

export async function createTopic(data) {
  return prisma.topic.create({
    data: {
      courseId: data.courseId,
      name: data.name,
      description: data.description || null,
    },
  });
}

export async function updateTopic(id, data) {
  return prisma.topic.update({ where: { id }, data });
}

export async function deleteTopic(id) {
  await prisma.topic.delete({ where: { id } });
}

// ===== TUTOR COURSES =====

const TUTOR_COURSE_INCLUDE = {
  course: { include: { coursePrice: true } },
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
      course: { include: { coursePrice: true } },
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

// ===== COURSE PRICES =====

export async function findAllCoursePrices() {
  return prisma.coursePrice.findMany({
    include: { course: { select: { id: true, code: true, name: true, complexity: true } } },
    orderBy: { course: { name: 'asc' } },
  });
}

export async function findCoursePrice(courseId) {
  return prisma.coursePrice.findUnique({
    where: { courseId },
    include: { course: true },
  });
}

export async function upsertCoursePrice(courseId, price) {
  return prisma.coursePrice.upsert({
    where: { courseId },
    create: { courseId, price },
    update: { price },
    include: { course: true },
  });
}
