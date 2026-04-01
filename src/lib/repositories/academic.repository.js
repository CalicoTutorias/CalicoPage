/**
 * Academic Repository
 * Handles database operations for Departments, Careers, Courses, Topics, and TutorCourses
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

export async function findTutorCourses(tutorId, limit = 50) {
  return prisma.tutorCourse.findMany({
    where: { tutorId },
    include: { course: true },
    take: limit,
  });
}

export async function findTutorsForCourse(courseId, limit = 50) {
  return prisma.tutorCourse.findMany({
    where: { courseId },
    include: {
      tutor: {
        include: { user: true },
      },
      course: true,
    },
    take: limit,
  });
}

export async function addTutorCourse(tutorId, courseId, customPrice) {
  return prisma.tutorCourse.create({
    data: { tutorId, courseId, customPrice },
    include: { course: true },
  });
}

export async function updateTutorCoursePrice(tutorId, courseId, customPrice) {
  return prisma.tutorCourse.update({
    where: { tutorId_courseId: { tutorId, courseId } },
    data: { customPrice },
    include: { course: true },
  });
}

export async function removeTutorCourse(tutorId, courseId) {
  await prisma.tutorCourse.delete({
    where: { tutorId_courseId: { tutorId, courseId } },
  });
}
