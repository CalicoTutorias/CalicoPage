/**
 * University Email Service
 *
 * A user (student or tutor, whatever their login email or provider) proves
 * they belong to a university by verifying an email on its domain. Verified,
 * they carry `verifiedUniversity` (e.g. 'uniandes'), which is the only thing
 * shown publicly — the badge — never the email itself.
 *
 * Flow: requestVerification stores the pending email and the SHA-256 hash of
 * a 32-byte token, and emails the link; verifyToken (POST from the confirm
 * page, after an explicit click) makes it the verified university email.
 * An already-verified login email on a university domain earns the badge
 * directly (grantFromVerifiedLoginEmail), without a second email.
 */

import crypto from 'crypto';
import * as universityEmailRepo from '../repositories/university-email.repository';
import { sendUniversityVerificationEmail } from './email.service';
import { normalizeEmail, universityByCode, universityForEmail } from '../universities/universities';

export const UNIVERSITY_TOKEN_EXPIRY_HOURS = 24;
/** Minimum time between two verification emails for the same user. */
export const UNIVERSITY_EMAIL_COOLDOWN_SECONDS = 60;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function domainError(message, code, extra = {}) {
  const err = new Error(message);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function publicUniversity(code) {
  const u = universityByCode(code);
  return u ? { code: u.code, name: u.name, shortName: u.shortName } : null;
}

/** What the owner sees in their profile. */
function toStatus(row, now = new Date()) {
  const pendingAlive = Boolean(row.pendingUniversityEmail)
    && row.universityEmailTokenExpiry
    && new Date(row.universityEmailTokenExpiry) > now;
  const sentAt = row.universityEmailSentAt ? new Date(row.universityEmailSentAt) : null;
  const resendAt = sentAt ? new Date(sentAt.getTime() + UNIVERSITY_EMAIL_COOLDOWN_SECONDS * 1000) : null;
  return {
    email: row.universityEmail ?? null,
    university: row.universityEmail ? publicUniversity(row.verifiedUniversity) : null,
    verifiedAt: row.universityEmailVerifiedAt ?? null,
    pendingEmail: pendingAlive ? row.pendingUniversityEmail : null,
    resendAvailableAt: pendingAlive && resendAt && resendAt > now ? resendAt : null,
  };
}

/** The caller's university email, badge and verification in progress. */
export async function getStatus(userId, now = new Date()) {
  const row = await universityEmailRepo.findStatus(userId);
  if (!row) throw domainError('Usuario no encontrado', 'NOT_FOUND');
  return toStatus(row, now);
}

/**
 * Email a verification link to `rawEmail`, which must be on a university
 * domain and not verified by someone else. Resending (same or new email)
 * replaces the previous link.
 */
export async function requestVerification(userId, rawEmail, now = new Date()) {
  const email = normalizeEmail(rawEmail);
  if (!EMAIL_SHAPE.test(email) || email.length > 254) {
    throw domainError('Escribe un correo válido', 'INVALID_EMAIL');
  }
  const university = universityForEmail(email);
  if (!university) {
    throw domainError('Por ahora solo se pueden verificar correos @uniandes.edu.co', 'DOMAIN_NOT_ALLOWED');
  }

  const row = await universityEmailRepo.findStatus(userId);
  if (!row) throw domainError('Usuario no encontrado', 'NOT_FOUND');
  if (row.universityEmail === email) {
    throw domainError('Ese correo ya está verificado en tu cuenta', 'ALREADY_VERIFIED');
  }
  if (await universityEmailRepo.isTakenByOther(email, userId)) {
    throw domainError('Ese correo ya está verificado en otra cuenta de Calico', 'EMAIL_TAKEN');
  }
  if (row.universityEmailSentAt) {
    const waitMs = new Date(row.universityEmailSentAt).getTime() + UNIVERSITY_EMAIL_COOLDOWN_SECONDS * 1000 - now.getTime();
    if (waitMs > 0) {
      throw domainError('Espera un momento antes de pedir otro correo', 'COOLDOWN', {
        retryAfterSeconds: Math.ceil(waitMs / 1000),
      });
    }
  }

  const token = crypto.randomBytes(32).toString('hex');
  const updated = await universityEmailRepo.startVerification(userId, {
    pendingEmail: email,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + UNIVERSITY_TOKEN_EXPIRY_HOURS * 3_600_000),
    sentAt: now,
  });

  try {
    await sendUniversityVerificationEmail(email, row.name || email, token, university.name);
  } catch (err) {
    console.error(`[university-email] Verification email failed for user ${userId}:`, err?.message);
    throw domainError('No pudimos enviar el correo. Intenta de nuevo en un minuto', 'EMAIL_SEND_FAILED');
  }

  return toStatus(updated, now);
}

/**
 * Confirm a link. Statuses: 'success' | 'invalid' | 'expired' | 'taken'
 * (another account verified that email in between) | 'unsupported' (the
 * domain is no longer in the list).
 */
export async function verifyToken(token, now = new Date()) {
  if (typeof token !== 'string' || token.length === 0 || token.length > 128) return { status: 'invalid' };
  const row = await universityEmailRepo.findByTokenHash(hashToken(token));
  if (!row || !row.pendingUniversityEmail) return { status: 'invalid' };

  if (!row.universityEmailTokenExpiry || new Date(row.universityEmailTokenExpiry) <= now) {
    await universityEmailRepo.clearPending(row.id);
    return { status: 'expired' };
  }

  const email = row.pendingUniversityEmail;
  const university = universityForEmail(email);
  if (!university) {
    await universityEmailRepo.clearPending(row.id);
    return { status: 'unsupported' };
  }
  if (await universityEmailRepo.isTakenByOther(email, row.id)) {
    await universityEmailRepo.clearPending(row.id);
    return { status: 'taken' };
  }

  try {
    await universityEmailRepo.completeVerification(row.id, {
      email,
      universityCode: university.code,
      verifiedAt: now,
    });
  } catch (err) {
    // Another account verified the same email between the check and the write.
    if (err?.code === 'P2002') {
      await universityEmailRepo.clearPending(row.id);
      return { status: 'taken' };
    }
    throw err;
  }
  return { status: 'success', university: publicUniversity(university.code) };
}

/** Remove the university email and the badge. */
export async function remove(userId, now = new Date()) {
  const row = await universityEmailRepo.findStatus(userId);
  if (!row) throw domainError('Usuario no encontrado', 'NOT_FOUND');
  return toStatus(await universityEmailRepo.remove(userId), now);
}

/**
 * A login email the user already verified (registration link, or Google) on a
 * university domain is proof enough: give the badge, unless they already have
 * a university email or another account verified this one. Never throws — it
 * must not break a login or an account verification.
 *
 * @returns {Promise<boolean>} whether the badge was granted now
 */
export async function grantFromVerifiedLoginEmail(user, now = new Date()) {
  try {
    if (!user?.id || user.universityEmail) return false;
    const email = normalizeEmail(user.email);
    const university = universityForEmail(email);
    if (!university) return false;
    if (await universityEmailRepo.isTakenByOther(email, user.id)) return false;
    const changed = await universityEmailRepo.grantIfNone(user.id, {
      email,
      universityCode: university.code,
      verifiedAt: now,
    });
    return changed > 0;
  } catch (err) {
    console.warn(`[university-email] Could not grant the badge to user ${user?.id}:`, err?.message);
    return false;
  }
}
