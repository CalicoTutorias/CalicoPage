/**
 * Safe handling of post-auth redirect targets ("returnTo").
 *
 * A returnTo value travels in URLs (?returnTo=...) and in localStorage
 * (pending booking), both of which an attacker or a stale client can tamper
 * with. Everything that reads one MUST pass it through sanitizeReturnTo —
 * otherwise the login flow becomes an open redirect (phishing vector:
 * /auth/login?returnTo=https://evil.com).
 *
 * Rules enforced:
 *  - same-origin relative paths only (must start with "/")
 *  - "//host", "/\host" and backslash variants are rejected (browsers treat
 *    them as protocol-relative / host-breaking URLs)
 *  - anything the URL parser resolves off-origin is rejected
 *  - never points back into /auth/* (prevents redirect loops)
 *  - bounded length
 */

const MAX_RETURN_TO_LENGTH = 2048;

// Dummy base used to detect values that escape the origin when parsed.
const INTERNAL_BASE = 'http://calico.internal';

/**
 * @param {unknown} value  Raw returnTo candidate (query param, storage, ...).
 * @returns {string|null}  A safe same-origin path ("/x?y=z") or null.
 */
export function sanitizeReturnTo(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > MAX_RETURN_TO_LENGTH) return null;
  if (!candidate.startsWith('/')) return null;
  // "//evil.com" is protocol-relative; "\" is normalized to "/" by browsers,
  // so any backslash can smuggle a host boundary. Reject both outright.
  if (candidate.startsWith('//') || candidate.includes('\\')) return null;

  let parsed;
  try {
    parsed = new URL(candidate, INTERNAL_BASE);
  } catch {
    return null;
  }
  if (parsed.origin !== INTERNAL_BASE) return null;

  // Path normalization by the URL parser can PRODUCE a leading "//" from an
  // input that began with a single "/" — e.g. "/..//evil.com" normalizes to a
  // pathname of "//evil.com", which as a redirect target is a protocol-relative
  // URL that resolves off-origin (https://evil.com). The raw-input check above
  // only sees the pre-normalization string, so re-check the normalized pathname.
  if (parsed.pathname.startsWith('//')) return null;

  // Bouncing back into the auth flow after login is never useful and can loop.
  if (parsed.pathname.startsWith('/auth/')) return null;

  // Rebuild from parsed parts (drops fragments and any parser oddities), then
  // re-verify the assembled target still resolves same-origin — belt-and-braces
  // against any normalization quirk that could reintroduce an off-origin form.
  const result = parsed.pathname + parsed.search;
  let reparsed;
  try {
    reparsed = new URL(result, INTERNAL_BASE);
  } catch {
    return null;
  }
  if (reparsed.origin !== INTERNAL_BASE) return null;

  return result;
}

/**
 * Append a sanitized returnTo to a route. Returns the route untouched when
 * the target doesn't survive sanitization.
 *
 * @param {string} path    Destination route (e.g. routes.LOGIN).
 * @param {unknown} target Candidate returnTo.
 * @returns {string}
 */
export function withReturnTo(path, target) {
  const safe = sanitizeReturnTo(target);
  if (!safe) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}returnTo=${encodeURIComponent(safe)}`;
}
