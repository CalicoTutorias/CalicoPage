const pad = (n) => String(n).padStart(2, '0');

function icsDate(value) {
  const d = new Date(value);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function escapeText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

const byteLength = (s) => new TextEncoder().encode(s).length;

// RFC 5545 folding: max 75 octets per line, continuation lines start with a space.
function fold(line) {
  if (byteLength(line) <= 75) return line;
  const parts = [];
  let current = '';
  let limit = 75;
  for (const ch of line) {
    if (byteLength(current + ch) > limit) {
      parts.push(current);
      current = ch;
      limit = 74; // the leading space counts toward the 75
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/**
 * `sessions` (optional, ≥ 2 items of { startsAt, endsAt }): one VEVENT per
 * day of a multi-day repaso, with uids "<n>-<uid>"; otherwise a single
 * VEVENT from startsAt to endsAt.
 */
export function buildEventIcs({ uid, title, description, startsAt, endsAt, sessions = null, location, url, now = new Date() }) {
  const occurrences = Array.isArray(sessions) && sessions.length > 1
    ? sessions.map((s, i) => ({ uid: `${i + 1}-${uid}`, startsAt: s.startsAt, endsAt: s.endsAt }))
    : [{ uid, startsAt, endsAt }];
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Calico//Eventos//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const occ of occurrences) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${occ.uid}`,
      `DTSTAMP:${icsDate(now)}`,
      `DTSTART:${icsDate(occ.startsAt)}`,
      `DTEND:${icsDate(occ.endsAt)}`,
      `SUMMARY:${escapeText(title)}`,
    );
    if (location) lines.push(`LOCATION:${escapeText(location)}`);
    if (url) lines.push(`URL:${url}`);
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
