/**
 * User Service
 * Business logic for user management
 */

import crypto from 'crypto';
import * as userRepository from '../repositories/user.repository';

// ---------------------------------------------------------------------------
// User CRUD
// ---------------------------------------------------------------------------

export async function getUserById(userId) {
  return userRepository.findById(userId);
}

export async function getUserByEmail(email) {
  return userRepository.findByEmail(email);
}

export async function updateUser(userId, data) {
  return userRepository.update(userId, data);
}

export async function getTutorsByCourse(courseId, limit = 50) {
  const tutors = await userRepository.findTutorsByCourse(courseId, limit);
  return { success: true, tutors, count: tutors.length };
}

export async function getAllTutors(limit = 100) {
  const tutors = await userRepository.findAllTutors(limit);
  return { success: true, tutors, count: tutors.length };
}

export async function deleteUser(userId) {
  await userRepository.deleteUser(userId);
}

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically secure verification token and persist it.
 * @param {string} userId
 * @returns {Promise<string>} The generated token
 */
export async function createVerificationToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await userRepository.update(userId, {
    verificationToken: token,
    isEmailVerified: false,
  });
  return token;
}

/**
 * Validate an email verification token and mark the user as verified.
 * @param {string} token
 * @returns {Promise<{status: string, user: Object|null}>}
 */
export async function verifyEmailToken(token) {
  const user = await userRepository.findByVerificationToken(token);
  if (!user) return { status: 'invalid', user: null };
  if (user.isEmailVerified) return { status: 'already', user };

  await userRepository.update(user.id, {
    isEmailVerified: true,
    verificationToken: null,
  });

  return { status: 'success', user };
}

/**
 * Check whether a user's email has been verified.
 * @param {string} email
 * @returns {Promise<{exists: boolean, isEmailVerified: boolean}>}
 */
export async function getVerificationStatus(email) {
  const user = await userRepository.findByEmail(email);
  if (!user) return { exists: false, isEmailVerified: false };
  return { exists: true, isEmailVerified: !!user.isEmailVerified };
}

// ---------------------------------------------------------------------------
// Password reset (magic link)
// ---------------------------------------------------------------------------

const RESET_TOKEN_EXPIRY_MINUTES = 30;

/**
 * Generate a secure reset token and store it with an expiry.
 * @param {number} userId
 * @returns {Promise<string>} The generated token
 */
export async function createResetToken(userId) {
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenExpiry = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);

  await userRepository.update(userId, { resetToken, resetTokenExpiry });

  return resetToken;
}

/**
 * Validate a password-reset token.
 * @param {string} token
 * @returns {Promise<Object|null>} The user if valid, null otherwise
 */
export async function validateResetToken(token) {
  const user = await userRepository.findByResetToken(token);
  if (!user) return null;

  if (Date.now() > new Date(user.resetTokenExpiry).getTime()) {
    await userRepository.update(user.id, { resetToken: null, resetTokenExpiry: null });
    return null;
  }

  return user;
}

/**
 * Clear all reset-related fields after a successful password change.
 * @param {string} userId
 */
export async function clearResetFields(userId) {
  await userRepository.update(userId, {
    resetToken: null,
    resetTokenExpiry: null,
    otpCode: null,
    otpCodeExpiry: null,
  });
}

/**
 * Verify OTP code and create a reset token for password reset flow.
 * @param {string} email - User email
 * @param {string} otpCode - 6-digit OTP code
 * @returns {object} { valid: boolean, resetToken?: string }
 */
export async function verifyOtp(email, otpCode) {
  const user = await userRepository.findByEmail(email);
  
  if (!user) {
    return { valid: false };
  }

  // Check if OTP matches and is not expired
  const now = new Date();
  if (user.otpCode !== otpCode || (user.otpCodeExpiry && user.otpCodeExpiry < now)) {
    return { valid: false };
  }

  // Create reset token for password reset
  const resetToken = await createResetToken(user.id);
  
  // Clear OTP fields
  await userRepository.update(user.id, {
    otpCode: null,
    otpCodeExpiry: null,
  });

  return { valid: true, resetToken };
}

// ---------------------------------------------------------------------------
// Tutor approval/rejection (admin operations)
// ---------------------------------------------------------------------------

/**
 * Approve a tutor application (admin operation).
 * Sets isTutorApproved = true if isTutorRequested = true.
 * @param {string} userId
 * @returns {Promise<Object>} Updated user
 */
export async function approveTutor(userId) {
  const user = await userRepository.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (!user.isTutorRequested) {
    const err = new Error('User has not requested tutor role');
    err.code = 'INVALID_STATE';
    throw err;
  }

  if (user.isTutorApproved) {
    const err = new Error('User is already approved as tutor');
    err.code = 'INVALID_STATE';
    throw err;
  }

  return userRepository.update(userId, { isTutorApproved: true });
}

/**
 * Reject a tutor application (admin operation).
 * Resets isTutorRequested and isTutorApproved to false.
 * @param {string} userId
 * @returns {Promise<Object>} Updated user
 */
export async function rejectTutor(userId) {
  const user = await userRepository.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (!user.isTutorRequested) {
    const err = new Error('User has not requested tutor role');
    err.code = 'INVALID_STATE';
    throw err;
  }

  return userRepository.update(userId, { isTutorRequested: false, isTutorApproved: false });
}
