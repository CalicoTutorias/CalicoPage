import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

// Default 1 hour — configurable via JWT_EXPIRATION env var.
// After a password change/reset, tokenVersion in the DB is bumped so tokens
// issued before the change are rejected even within this window.
export const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '1h';

const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };

/**
 * JWT_EXPIRATION as seconds — the Max-Age every auth cookie must use.
 *
 * The session travels in an HttpOnly cookie; when its Max-Age was a
 * hard-coded hour while the token lasted 7 days, the cookie silently vanished
 * after 60 min and every authenticated call started failing with
 * "Missing or malformed Authorization header" behind a UI that still looked
 * logged in (2026-10-12). One source of truth, parsed from the same env var
 * jsonwebtoken reads (`3600`, `30m`, `1h`, `7d`, `2w`).
 */
export function tokenMaxAgeSeconds(expiration = JWT_EXPIRATION) {
  const raw = String(expiration ?? '').trim();
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = /^(\d+(?:\.\d+)?)\s*([smhdw])$/i.exec(raw);
  if (!m) throw new Error(`Unsupported JWT_EXPIRATION format: "${raw}"`);
  return Math.round(Number(m[1]) * UNIT_SECONDS[m[2].toLowerCase()]);
}

/**
 * Sign a JWT token with essential user authorization data.
 * Payload is kept lightweight to avoid DB lookups for basic permission checks.
 *
 * @param {{ id: string, email: string, role: string, isTutorRequested: boolean, isTutorApproved: boolean, tokenVersion?: number }} user
 * @returns {string} Signed JWT
 */
export function signToken(user) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role ?? 'STUDENT',
    isTutorRequested: user.isTutorRequested ?? false,
    isTutorApproved: user.isTutorApproved ?? false,
    tokenVersion: user.tokenVersion ?? 0,
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
