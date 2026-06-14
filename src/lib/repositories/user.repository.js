/**
 * User Repository
 * Handles all database operations for user data (PostgreSQL via Prisma)
 */

import prisma from '../prisma';
import { normalizePhoneNumber } from '../utils/phone';

// Fields to never return to the client
const SENSITIVE_FIELDS = ['passwordHash', 'verificationToken', 'resetToken', 'resetTokenExpiry', 'otpCode', 'otpCodeExpiry'];

// Private-by-default fields: stripped from every generic user fetch so they
// never leak through /api/users/:id or /api/auth/me. The student rating
// (tutor → estudiante, estilo Uber) is only exposed deliberately:
//   - to tutors, attached to their session payloads (session.service)
//   - to the owner, via GET /api/users/me/student-rating (number only)
//   - to admins, via admin-users.service explicit selects
const PRIVATE_FIELDS = ['studentRating', 'studentRatingCount'];

function withNormalizedPhone(data = {}) {
  if (!Object.prototype.hasOwnProperty.call(data, 'phoneNumber')) return data;
  return {
    ...data,
    phoneNumberNormalized: normalizePhoneNumber(data.phoneNumber),
  };
}

/**
 * Strip sensitive fields from a user object.
 * Exported as `sanitizeUser` for routes that must work with a raw Prisma user
 * (e.g. login needs passwordHash to compare) and then sanitize the response
 * themselves — so there is exactly ONE strip list in the codebase.
 */
function sanitize(user) {
  if (!user) return null;
  const clean = { ...user };
  for (const field of [...SENSITIVE_FIELDS, ...PRIVATE_FIELDS]) {
    delete clean[field];
  }
  return clean;
}

export { sanitize as sanitizeUser };

/**
 * Find user by ID (public-safe — no password hash)
 * @param {string} userId - UUID
 * @returns {Promise<Object|null>}
 */
export async function findById(userId) {
  const user = await prisma.user.findUnique({
    where: { id: String(userId ?? '').trim() },
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
    where: { id: String(userId ?? '').trim() },
  });
}

/**
 * Stamp the user's last activity in the app ("last seen", for engagement
 * metrics). Called on login AND on the /api/auth/me heartbeat, because the
 * JWT session persists and a user may never log in again explicitly.
 * Best-effort: callers invoke this fire-and-forget, so a failure — e.g.
 * before the `last_seen_at` migration has run — never blocks the response.
 * @param {string} userId
 */
export async function touchLastSeen(userId) {
  return prisma.user.update({
    where: { id: String(userId ?? '').trim() },
    data: { lastSeenAt: new Date() },
    select: { id: true },
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
 * Find user by canonical phone number. Used by admin manual-session flows to
 * attach an existing student before creating a temporary external user.
 * @param {string} phoneNumber
 * @returns {Promise<Object|null>}
 */
export async function findByPhoneNumber(phoneNumber) {
  const phoneNumberNormalized = normalizePhoneNumber(phoneNumber);
  if (!phoneNumberNormalized) return null;
  const user = await prisma.user.findUnique({
    where: { phoneNumberNormalized },
    include: { tutorProfile: true, career: { include: { department: true } } },
  });
  return sanitize(user);
}

/**
 * Fetch the OTP verification state for a user by email. Returns the raw
 * (un-sanitized) OTP fields — which the generic `findByEmail` strips — so the
 * password-reset OTP flow can compare the code and enforce its attempt counter.
 * @param {string} email
 * @returns {Promise<{ id: string, otpCode: string|null, otpCodeExpiry: Date|null, otpAttempts: number }|null>}
 */
export async function findOtpStateByEmail(email) {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, otpCode: true, otpCodeExpiry: true, otpAttempts: true },
  });
}

/**
 * Create a new user
 * @param {Object} data - User fields (must include email, passwordHash, name)
 * @returns {Promise<Object>} Created user (sanitized)
 */
export async function create(data) {
  const user = await prisma.user.create({ data: withNormalizedPhone(data) });
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
    where: { id: String(userId ?? '').trim() },
    data: withNormalizedPhone(data),
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
 * Find user by Google ID
 * @param {string} googleId
 * @returns {Promise<Object|null>}
 */
export async function findByGoogleId(googleId) {
  const user = await prisma.user.findUnique({
    where: { googleId },
    include: { tutorProfile: true, career: { include: { department: true } } },
  });
  return sanitize(user);
}

/**
 * Find user by Google ID including password hash
 * @param {string} googleId
 * @returns {Promise<Object|null>}
 */
export async function findByGoogleIdWithPassword(googleId) {
  return prisma.user.findUnique({
    where: { googleId },
  });
}

/**
 * Delete user
 * @param {string} userId - UUID
 */
export async function deleteUser(userId) {
  await prisma.user.delete({ where: { id: userId } });
}
