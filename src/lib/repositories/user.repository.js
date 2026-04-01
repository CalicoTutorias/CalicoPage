/**
 * User Repository
 * Handles all database operations for user data (PostgreSQL via Prisma)
 */

import prisma from '../prisma';

// Fields to never return to the client
const SENSITIVE_FIELDS = ['passwordHash', 'verificationToken', 'resetToken', 'resetTokenExpiry', 'otpCode', 'otpCodeExpiry'];

/**
 * Strip sensitive fields from a user object.
 */
function sanitize(user) {
  if (!user) return null;
  const clean = { ...user };
  for (const field of SENSITIVE_FIELDS) {
    delete clean[field];
  }
  return clean;
}

/**
 * Find user by ID (public-safe — no password hash)
 * @param {string} userId - UUID
 * @returns {Promise<Object|null>}
 */
export async function findById(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      tutorProfile: true,
      career: { include: { department: true } },
      tutorApplications: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  if (!user) return null;
  const clean = sanitize(user);
  // Expose the latest application status as a flat field for the client
  clean.tutorApplicationStatus = clean.tutorApplications?.[0]?.status ?? null;
  delete clean.tutorApplications;
  return clean;
}

/**
 * Find user by ID including sensitive fields (for auth operations only)
 * @param {string} userId - UUID
 * @returns {Promise<Object|null>}
 */
export async function findByIdWithPassword(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
  });
}

/**
 * Find user by email (public-safe)
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
export async function findByEmail(email) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { tutorProfile: true, career: { include: { department: true } } },
  });
  return sanitize(user);
}

/**
 * Find user by email including password hash (for login)
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
export async function findByEmailWithPassword(email) {
  return prisma.user.findUnique({
    where: { email },
  });
}

/**
 * Create a new user
 * @param {Object} data - User fields (must include email, passwordHash, name)
 * @returns {Promise<Object>} Created user (sanitized)
 */
export async function create(data) {
  const user = await prisma.user.create({ data });
  return sanitize(user);
}

/**
 * Update user by ID
 * @param {string} userId - UUID
 * @param {Object} data - Fields to update
 * @returns {Promise<Object>} Updated user (sanitized)
 */
export async function update(userId, data) {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
  });
  return sanitize(user);
}

/**
 * Find all approved tutors
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function findAllTutors(limit = 100) {
  const users = await prisma.user.findMany({
    where: { isTutorApproved: true },
    include: {
      tutorProfile: {
        include: { tutorCourses: { include: { course: true } } },
      },
    },
    take: limit,
  });
  return users.map(sanitize);
}

/**
 * Find tutors by course
 * @param {string} courseId - Course UUID
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function findTutorsByCourse(courseId, limit = 50) {
  const users = await prisma.user.findMany({
    where: {
      isTutorApproved: true,
      tutorProfile: {
        tutorCourses: { some: { courseId } },
      },
    },
    include: {
      tutorProfile: {
        include: { tutorCourses: { include: { course: true } } },
      },
    },
    take: limit,
  });
  return users.map(sanitize);
}

/**
 * Find user by email verification token
 * @param {string} token
 * @returns {Promise<Object|null>}
 */
export async function findByVerificationToken(token) {
  return prisma.user.findFirst({
    where: { verificationToken: token },
  });
}

/**
 * Find user by password reset token
 * @param {string} token
 * @returns {Promise<Object|null>}
 */
export async function findByResetToken(token) {
  return prisma.user.findFirst({
    where: { resetToken: token },
  });
}

/**
 * Delete user
 * @param {string} userId - UUID
 */
export async function deleteUser(userId) {
  await prisma.user.delete({ where: { id: userId } });
}
