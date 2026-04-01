import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '7d';

/**
 * Sign a JWT token with essential user authorization data.
 * Payload is kept lightweight to avoid DB lookups for basic permission checks.
 *
 * @param {{ id: string, email: string, isTutorRequested: boolean, isTutorApproved: boolean }} user
 * @returns {string} Signed JWT
 */
export function signToken(user) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  const payload = {
    sub: user.id,
    email: user.email,
    isTutorRequested: user.isTutorRequested ?? false,
    isTutorApproved: user.isTutorApproved ?? false,
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRATION });
}

/**
 * Verify and decode a JWT token.
 *
 * @param {string} token - The JWT to verify
 * @returns {{ success: true, payload: object } | { success: false, error: string, code: string }}
 */
export function verifyToken(token) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return { success: true, payload };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return { success: false, error: 'Token expired', code: 'TOKEN_EXPIRED' };
    }
    return { success: false, error: 'Invalid token', code: 'TOKEN_INVALID' };
  }
}
