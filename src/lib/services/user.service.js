/**
 * User Service
 * Business logic for user management
 */

import crypto from 'crypto';
import * as userRepository from '../repositories/user.repository';
import * as reviewRepository from '../repositories/review.repository';

/**
 * Hash a magic-link token before persisting it. We store only the hash in the
 * DB so a database leak does not hand out usable reset/verification tokens.
 * The tokens are 32 bytes of CSPRNG output, so a plain SHA-256 (no salt) is
 * safe AND deterministic — letting us look the user up by exact hash match.
 *
 * @param {string} token - The raw token (the value emailed to the user)
 * @returns {string} Hex-encoded SHA-256 of the token
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

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

  // Augment each tutor with their rating *in this specific course*. The
  // search-by-materia comparative card needs both the global rating
  // (already in tutor.tutorProfile.review) and the per-subject one so
  // students can compare at a glance.
  const tutorIds = tutors
    .map((t) => t.id || t.uid || t.userId)
    .filter(Boolean);
  const ratingByTutor = await reviewRepository.getRatingByTutorMap(courseId, tutorIds);

  const enriched = tutors.map((tutor) => {
    const tutorId = tutor.id || tutor.uid || tutor.userId;
    const agg = ratingByTutor.get(tutorId) ?? { average: 0, count: 0 };
    return {
      ...tutor,
      subjectRating: Number(agg.average.toFixed(2)),
      subjectReviewCount: agg.count,
    };
  });

  return { success: true, tutors: enriched, count: enriched.length };
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

const VERIFICATION_TOKEN_EXPIRY_HOURS = 24;

/**
 * Generate a cryptographically secure verification token and persist it
 * with a 24-hour expiry.
 * @param {string} userId
 * @returns {Promise<string>} The generated token
 */
export async function createVerificationToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const verificationTokenExpiry = new Date(
    Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
  );
  // Persist only the hash; the raw token travels in the email and is never stored.
  await userRepository.update(userId, {
    verificationToken: hashToken(token),
    verificationTokenExpiry,
    isEmailVerified: false,
  });
  return token;
}

/**
 * Validate an email verification token and mark the user as verified.
 * Returns 'expired' if the token exists but its window has passed.
 * @param {string} token
 * @returns {Promise<{status: string, user: Object|null}>}
 */
export async function verifyEmailToken(token) {
  const user = await userRepository.findByVerificationToken(hashToken(token));
  if (!user) return { status: 'invalid', user: null };
  if (user.isEmailVerified) return { status: 'already', user };

  // Treat missing expiry (legacy rows) as expired — forces a new token request.
  const expiry = user.verificationTokenExpiry;
  if (!expiry || Date.now() > new Date(expiry).getTime()) {
    await userRepository.update(user.id, {
      verificationToken: null,
      verificationTokenExpiry: null,
    });
    return { status: 'expired', user: null };
  }

  await userRepository.update(user.id, {
    isEmailVerified: true,
    verificationToken: null,
    verificationTokenExpiry: null,
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

  // Persist only the hash; the raw token travels in the reset link, never stored.
  await userRepository.update(userId, { resetToken: hashToken(resetToken), resetTokenExpiry });

  return resetToken;
}

/**
 * Validate a password-reset token.
 * @param {string} token
 * @returns {Promise<Object|null>} The user if valid, null otherwise
 */
export async function validateResetToken(token) {
  const user = await userRepository.findByResetToken(hashToken(token));
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

// Max failed OTP guesses allowed against a single issued code before it's
// invalidated. Combined with the per-email/IP rate limit on the route, this
// makes brute-forcing a 6-digit OTP infeasible even across multiple instances
// (the counter lives in the DB, not in per-process memory).
const MAX_OTP_ATTEMPTS = 5;

/**
 * Constant-time string comparison. Avoids leaking how many leading characters
 * matched via response timing. Returns false fast on length mismatch (which is
 * not secret here — OTPs are a fixed 6 digits).
 */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Verify an OTP code and, on success, create a reset token for the password
 * reset flow. Enforces a DB-backed attempt counter: after MAX_OTP_ATTEMPTS
 * failures the code is invalidated so it cannot be brute-forced.
 *
 * NOTE: whatever issues a new OTP (`otpCode`/`otpCodeExpiry`) MUST also reset
 * `otpAttempts` to 0, or the user could start locked out.
 *
 * @param {string} email - User email (expected already normalized/lowercased)
 * @param {string} otpCode - 6-digit OTP code
 * @returns {Promise<{ valid: boolean, resetToken?: string, locked?: boolean }>}
 */
export async function verifyOtp(email, otpCode) {
  const user = await userRepository.findOtpStateByEmail(email);

  // No user, or no OTP currently issued → nothing to verify.
  if (!user || !user.otpCode) {
    return { valid: false };
  }

  // Lockout: the current code already burned through its allowed attempts.
  if ((user.otpAttempts ?? 0) >= MAX_OTP_ATTEMPTS) {
    await userRepository.update(user.id, { otpCode: null, otpCodeExpiry: null, otpAttempts: 0 });
    return { valid: false, locked: true };
  }

  const expired = user.otpCodeExpiry && new Date(user.otpCodeExpiry) < new Date();
  const matches = safeEqual(user.otpCode, otpCode);

  if (expired || !matches) {
    const attempts = (user.otpAttempts ?? 0) + 1;
    // Invalidate the code on expiry or once the attempt cap is reached;
    // otherwise just record the failed attempt.
    if (expired || attempts >= MAX_OTP_ATTEMPTS) {
      await userRepository.update(user.id, { otpCode: null, otpCodeExpiry: null, otpAttempts: 0 });
    } else {
      await userRepository.update(user.id, { otpAttempts: attempts });
    }
    return { valid: false };
  }

  // Success: issue the reset token and clear all OTP state.
  const resetToken = await createResetToken(user.id);
  await userRepository.update(user.id, {
    otpCode: null,
    otpCodeExpiry: null,
    otpAttempts: 0,
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
