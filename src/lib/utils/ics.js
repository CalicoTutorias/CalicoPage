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

export function buildEventIcs({ uid, title, description, startsAt, endsAt, location, url, now = new Date() }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Calico//Eventos//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(startsAt)}`,
    `DTEND:${icsDate(endsAt)}`,
    `SUMMARY:${escapeText(title)}`,
  ];
  if (location) lines.push(`LOCATION:${escapeText(location)}`);
  if (url) lines.push(`URL:${url}`);
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
